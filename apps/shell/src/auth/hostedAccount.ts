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

export function supabaseEmailRedirectUrl(auth: "register" | "login" = "register"): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://atom.qwixl.com";
  return `${origin}/app/?auth=${auth}`;
}

export function isEmailNotConfirmedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /email not confirmed|not confirmed/i.test(message);
}

/** Sign up; returns whether the user must confirm email before a session exists. */
export async function registerSupabaseAccount(
  email: string,
  password: string,
): Promise<{ needsEmailConfirmation: boolean }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: supabaseEmailRedirectUrl() },
  });
  if (error) throw error;
  if (data.session) return { needsEmailConfirmation: false };
  if (data.user && !data.session) return { needsEmailConfirmation: true };

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (!signInError) return { needsEmailConfirmation: false };
  if (isEmailNotConfirmedError(signInError)) return { needsEmailConfirmation: true };
  throw signInError;
}

export async function signInSupabaseAccount(email: string, password: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
}

export async function resendSignupConfirmation(
  email: string,
  auth: "register" | "login" = "register",
): Promise<void> {
  const { error } = await getSupabaseClient().auth.resend({
    type: "signup",
    email: email.trim(),
    options: { emailRedirectTo: supabaseEmailRedirectUrl(auth) },
  });
  if (error) throw error;
}

export async function hasSupabaseSession(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { data } = await getSupabaseClient().auth.getSession();
  return Boolean(data.session);
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
