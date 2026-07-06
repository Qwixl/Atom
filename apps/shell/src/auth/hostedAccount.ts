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

export function isEmailRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /rate limit|too many requests|\b429\b/i.test(message);
}

function isInvalidCredentialsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /invalid login credentials|invalid email or password/i.test(message);
}

function isUserAlreadyRegisteredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already registered|already been registered|user already exists/i.test(message);
}

export type SupabaseRegisterResult = {
  needsEmailConfirmation: boolean;
  note?: string;
};

/** Sign in or sign up; avoids redundant signUp emails when the account already exists. */
export async function registerSupabaseAccount(
  email: string,
  password: string,
): Promise<SupabaseRegisterResult> {
  const supabase = getSupabaseClient();
  const normalizedEmail = email.trim();

  const { data: sessionData } = await supabase.auth.getSession();
  if (
    sessionData.session?.user?.email?.trim().toLowerCase() === normalizedEmail.toLowerCase()
  ) {
    return { needsEmailConfirmation: false };
  }

  const signInResult = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });
  if (!signInResult.error) return { needsEmailConfirmation: false };
  if (isEmailNotConfirmedError(signInResult.error)) {
    return {
      needsEmailConfirmation: true,
      note: "Check your inbox for the confirmation link we already sent.",
    };
  }
  if (!isInvalidCredentialsError(signInResult.error)) {
    throw signInResult.error;
  }

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: { emailRedirectTo: supabaseEmailRedirectUrl() },
  });

  if (error) {
    if (isUserAlreadyRegisteredError(error) || isEmailRateLimitError(error)) {
      const retry = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (!retry.error) return { needsEmailConfirmation: false };
      if (isEmailNotConfirmedError(retry.error)) {
        return {
          needsEmailConfirmation: true,
          note: isEmailRateLimitError(error)
            ? "Too many emails sent recently. Use the confirmation link already in your inbox, or wait a few minutes."
            : "Check your inbox for the confirmation link we already sent.",
        };
      }
      if (isEmailRateLimitError(error)) {
        throw new Error(
          "Too many signup emails sent recently. Check your inbox for an existing confirmation link, or wait a few minutes before trying again.",
        );
      }
      if (isUserAlreadyRegisteredError(error)) {
        throw new Error("An account with this email already exists. Try logging in instead.");
      }
    }
    throw error;
  }

  if (data.session) return { needsEmailConfirmation: false };
  if (data.user && !data.session) return { needsEmailConfirmation: true };

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
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

/** Drop cached tokens when the Supabase user was deleted server-side. */
export async function clearStaleSupabaseSession(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) {
    await supabase.auth.signOut();
  }
}

export async function signOutSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabaseClient().auth.signOut();
}

export function friendlyHostedProvisionError(message: string): string {
  if (/command failed:\s*docker|docker run/i.test(message)) {
    return "We couldn't start your hosted agent. The hosting service may be temporarily unavailable — try again in a few minutes.";
  }
  if (/control plane starting|503/i.test(message)) {
    return "The hosting service is starting up. Wait a moment, then try again.";
  }
  if (/not ready|complete signup first/i.test(message)) {
    return "Your agent is still being set up. Wait a moment, then click Try again.";
  }
  return message;
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
