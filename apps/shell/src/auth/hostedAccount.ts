import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "../hostConfig.js";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured for this build");
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export async function supabaseAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabaseClient().auth.getSession();
  return data.session?.access_token ?? null;
}

export type AtomAccountType = "user" | "business" | "developer";

export interface BootstrapHostedAccountInput {
  handle: string;
  accountType: AtomAccountType;
  llmApiKey: string;
  llmProvider?: string;
  llmModel?: string;
  llmBaseUrl?: string;
}

export async function signupHostedDevAccount(input: {
  email: string;
  handle: string;
}): Promise<{ adminUrl: string; adminToken: string; handle: string }> {
  const { CONTROL_PLANE_URL } = await import("../hostConfig.js");
  const resp = await fetch(`${CONTROL_PLANE_URL.replace(/\/$/, "")}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: input.email.trim(),
      handle: input.handle,
    }),
  });
  const data = (await resp.json()) as {
    agentUrl?: string;
    adminToken?: string;
    handle?: string;
    error?: string;
  };
  if (!resp.ok) throw new Error(data.error ?? `Signup failed (${resp.status})`);
  if (!data.agentUrl || !data.adminToken) {
    throw new Error("Hosted agent credentials were not returned");
  }
  return {
    adminUrl: data.agentUrl.replace(/\/$/, ""),
    adminToken: data.adminToken,
    handle: data.handle ?? input.handle,
  };
}

export async function bootstrapHostedAccount(input: BootstrapHostedAccountInput): Promise<void> {
  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in required");

  const { CONTROL_PLANE_URL } = await import("../hostConfig.js");
  const resp = await fetch(`${CONTROL_PLANE_URL.replace(/\/$/, "")}/account/bootstrap`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      handle: input.handle,
      accountType: input.accountType,
      llmApiKey: input.llmApiKey,
      llmProvider: input.llmProvider,
      llmModel: input.llmModel,
      llmBaseUrl: input.llmBaseUrl,
    }),
  });
  const data = (await resp.json()) as { error?: string };
  if (!resp.ok) throw new Error(data.error ?? `Signup failed (${resp.status})`);
}

export async function fetchHostedAgentConnection(): Promise<{
  adminUrl: string;
  adminToken: string;
  handle?: string;
}> {
  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in required");

  const { CONTROL_PLANE_URL } = await import("../hostConfig.js");
  const resp = await fetch(`${CONTROL_PLANE_URL.replace(/\/$/, "")}/account/connect`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const data = (await resp.json()) as {
    agentUrl?: string;
    adminToken?: string;
    handle?: string;
    error?: string;
  };
  if (!resp.ok) throw new Error(data.error ?? `Connect failed (${resp.status})`);
  if (!data.agentUrl || !data.adminToken) {
    throw new Error("Hosted agent credentials were not returned");
  }
  return {
    adminUrl: data.agentUrl.replace(/\/$/, ""),
    adminToken: data.adminToken,
    handle: data.handle,
  };
}
