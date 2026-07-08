/** Build Atom JSON protocol text for Responses API image_generation results. */
export function buildImageResultProtocol(imageUrls: readonly string[], caption?: string): string {
  const messages: unknown[] = [];
  const intro = caption?.trim() || "Here is your generated image.";
  messages.push({ type: "text", text: intro });
  messages.push({
    type: "composition",
    composition: {
      version: 1,
      surfaceId: `generated-image-${Date.now()}`,
      intent: "Generated image",
      root: {
        id: "image-card",
        component: "core/card",
        semanticRole: "container/card",
        props: { title: "Generated image" },
        children: imageUrls.map((src, index) => ({
          id: `image-${index}`,
          component: "core/image",
          semanticRole: "media/image",
          props: { src, alt: `Generated image ${index + 1}` },
        })),
      },
    },
  });
  return JSON.stringify({ messages });
}

/** Walk Responses API output for image URLs or data URLs. */
export function extractImageUrlsFromResponse(data: Record<string, unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  collectImageUrls(data, out, seen);
  return out;
}

function collectImageUrls(value: unknown, out: string[], seen: Set<string>): void {
  if (value == null) return;
  if (typeof value === "string") {
    if (isImageUrl(value) && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImageUrls(item, out, seen);
    return;
  }
  if (typeof value !== "object") return;

  const row = value as Record<string, unknown>;
  for (const key of ["url", "image_url", "imageUrl", "result", "src"] as const) {
    const candidate = row[key];
    if (typeof candidate === "string" && isImageUrl(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  }
  if (typeof row.b64_json === "string" && row.b64_json.length > 0) {
    const mime = typeof row.mime_type === "string" ? row.mime_type : "image/png";
    const dataUrl = `data:${mime};base64,${row.b64_json}`;
    if (!seen.has(dataUrl)) {
      seen.add(dataUrl);
      out.push(dataUrl);
    }
  }
  for (const nested of Object.values(row)) collectImageUrls(nested, out, seen);
}

function isImageUrl(value: string): boolean {
  return (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:image/")
  );
}
