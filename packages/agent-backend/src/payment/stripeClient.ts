/** Stripe REST helpers — form-encoded API v1 (no SDK dependency). */

export interface StripeClientOptions {
  secretKey: string;
  fetchImpl?: typeof fetch;
  apiBase?: string;
}

export class StripeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "StripeApiError";
  }
}

export function encodeStripeParams(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.set(key, String(value));
  }
  return body.toString();
}

export function encodeStripeMetadata(metadata: Record<string, string>): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(metadata)) {
    body.set(`metadata[${key}]`, value);
  }
  return body.toString();
}

export async function stripeRequest<T>(
  options: StripeClientOptions,
  method: "GET" | "POST",
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.apiBase ?? "https://api.stripe.com/v1";
  let url = `${base}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.secretKey}`,
    ...extraHeaders,
  };
  let body: string | undefined;
  if (method === "GET" && params) {
    const qs = encodeStripeParams(params);
    url = qs ? `${url}?${qs}` : url;
  } else if (method === "POST" && params) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = encodeStripeParams(params);
  }
  const response = await fetchImpl(url, { method, headers, body });
  const json = (await response.json()) as T & {
    error?: { message?: string; code?: string };
  };
  if (!response.ok) {
    throw new StripeApiError(
      json.error?.message ?? `Stripe API ${response.status}`,
      response.status,
      json.error?.code,
    );
  }
  return json;
}

export interface StripePaymentIntent {
  id: string;
  status: string;
  amount: number;
  currency: string;
  client_secret?: string;
  capture_method?: string;
  canceled_at?: number | null;
  latest_charge?: string | { id?: string } | null;
}

export interface StripeProduct {
  id: string;
  name: string;
  active: boolean;
}

export interface StripePrice {
  id: string;
  product: string;
  unit_amount: number;
  currency: string;
}

export interface StripeList<T> {
  data: T[];
}
