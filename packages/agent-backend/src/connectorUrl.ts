/** HTTPS URL validation for connector fetch (blocks non-http(s) schemes). */

export function validateConnectorHttpsUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("URL required");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("URL must be http(s)");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    throw new Error("Private or local URLs are not allowed");
  }
  return parsed.toString();
}

export async function fetchTextLimited(url: string, maxBytes = 256_000): Promise<string> {
  const normalized = validateConnectorHttpsUrl(url);
  const resp = await fetch(normalized, {
    headers: { Accept: "text/html, text/plain, application/xml, application/rss+xml, */*" },
    redirect: "follow",
  });
  if (!resp.ok) {
    throw new Error(`Fetch failed (${resp.status})`);
  }
  const reader = resp.body?.getReader();
  if (!reader) {
    const text = await resp.text();
    return text.slice(0, maxBytes);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
  }
  const merged = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, maxBytes - offset);
    merged.set(slice, offset);
    offset += slice.length;
    if (offset >= maxBytes) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
