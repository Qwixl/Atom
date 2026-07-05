export const TEST_ADMIN_TOKEN = "test-admin-token";

export function testAdminHeaders(extra?: Record<string, string>): HeadersInit {
  return {
    Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
    ...extra,
  };
}

export async function adminPostJson<T>(
  baseUrl: string,
  route: string,
  body: Record<string, unknown>,
): Promise<T> {
  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

export async function adminGetJson<T>(baseUrl: string, route: string): Promise<T> {
  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}${route}`, {
    headers: { Authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
  });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

export function installTestAdminToken(): () => void {
  const prev = process.env.ATOM_ADMIN_TOKEN;
  process.env.ATOM_ADMIN_TOKEN = TEST_ADMIN_TOKEN;
  return () => {
    if (prev === undefined) delete process.env.ATOM_ADMIN_TOKEN;
    else process.env.ATOM_ADMIN_TOKEN = prev;
  };
}
