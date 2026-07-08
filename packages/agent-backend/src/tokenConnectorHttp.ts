/** HTTPS JSON fetch without injected Authorization (e.g. Trello query-param auth). */
export async function fetchJson(
  url: string,
  init?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<unknown> {
  const method = init?.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...init?.headers,
  };
  let body: string | undefined;
  if (init?.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  let parsed: unknown = text;
  if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = text;
    }
  }
  if (!response.ok) {
    const detail =
      typeof parsed === "object" && parsed !== null && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : text.slice(0, 240);
    throw new Error(`Token connector request failed (${response.status}): ${detail}`);
  }
  return parsed;
}

/** HTTPS JSON fetch with a raw Authorization header value (e.g. Linear API keys). */
export async function fetchJsonWithAuthorizationHeader(
  url: string,
  authorization: string,
  init?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<unknown> {
  const method = init?.method ?? "GET";
  const headers: Record<string, string> = {
    Authorization: authorization,
    Accept: "application/json",
    ...init?.headers,
  };
  let body: string | undefined;
  if (init?.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  let parsed: unknown = text;
  if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = text;
    }
  }
  if (!response.ok) {
    const detail =
      typeof parsed === "object" && parsed !== null && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : text.slice(0, 240);
    throw new Error(`Token connector request failed (${response.status}): ${detail}`);
  }
  return parsed;
}

/** HTTPS JSON fetch for vault-stored personal API tokens (BK-07). */

export async function fetchJsonWithBearerToken(
  url: string,
  token: string,
  init?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<unknown> {
  const method = init?.method ?? "GET";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...init?.headers,
  };
  let body: string | undefined;
  if (init?.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  let parsed: unknown = text;
  if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = text;
    }
  }
  if (!response.ok) {
    const detail =
      typeof parsed === "object" && parsed !== null && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : text.slice(0, 240);
    throw new Error(`Token connector request failed (${response.status}): ${detail}`);
  }
  return parsed;
}
