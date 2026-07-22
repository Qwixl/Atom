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
}): Promise<{
  adminUrl: string;
  /** Present only on legacy control planes; hosted PR2 omits root admin. */
  adminToken?: string;
  sessionToken?: string;
  handle: string;
}> {
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
    sessionToken?: string;
    handle?: string;
    error?: string;
  };
  if (!resp.ok) throw new Error(data.error ?? `Signup failed (${resp.status})`);
  if (!data.agentUrl?.trim()) {
    throw new Error("Hosted agent credentials were not returned");
  }
  if (!data.sessionToken?.trim() && !data.adminToken?.trim()) {
    throw new Error("Hosted agent session was not returned");
  }
  return {
    adminUrl: data.agentUrl.replace(/\/$/, ""),
    adminToken: data.adminToken?.trim() || undefined,
    sessionToken: data.sessionToken?.trim() || undefined,
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

export async function fetchHostedAccountStatus(): Promise<{
  accountType?: AtomAccountType;
  handle?: string;
  displayName?: string;
  onboardingComplete?: boolean;
}> {
  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in required");

  const { CONTROL_PLANE_URL } = await import("../hostConfig.js");
  try {
    const resp = await fetch(`${CONTROL_PLANE_URL.replace(/\/$/, "")}/account/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await resp.json()) as {
      profile?: {
        accountType?: AtomAccountType;
        handle?: string;
        displayName?: string;
        onboardingComplete?: boolean;
      };
      error?: string;
    };
    if (resp.ok) {
      return {
        accountType: data.profile?.accountType,
        handle: data.profile?.handle,
        displayName: data.profile?.displayName,
        onboardingComplete: data.profile?.onboardingComplete,
      };
    }
  } catch {
    /* Fall through to direct Supabase profile read (local / control-plane down). */
  }

  const { data: auth } = await getSupabaseClient().auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Sign in required");
  const { data: profile, error } = await getSupabaseClient()
    .from("profiles")
    .select("handle, display_name, account_type, onboarding_complete")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    accountType: (profile?.account_type as AtomAccountType | undefined) ?? undefined,
    handle: profile?.handle ?? undefined,
    displayName: profile?.display_name ?? undefined,
    onboardingComplete: profile?.onboarding_complete ?? undefined,
  };
}

export async function fetchHostedAgentConnection(workspaceId?: string): Promise<{
  adminUrl: string;
  /** Present only on legacy control planes; hosted PR2 omits root admin. */
  adminToken?: string;
  sessionToken?: string;
  handle?: string;
  workspaceId?: string;
}> {
  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in required");

  const { CONTROL_PLANE_URL } = await import("../hostConfig.js");
  const base = CONTROL_PLANE_URL.replace(/\/$/, "");
  const path = workspaceId?.trim()
    ? `/workspaces/${encodeURIComponent(workspaceId.trim())}/connect`
    : "/account/connect";
  const resp = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const data = (await resp.json()) as {
    agentUrl?: string;
    adminToken?: string;
    sessionToken?: string;
    handle?: string;
    workspaceId?: string;
    error?: string;
  };
  if (!resp.ok) throw new Error(data.error ?? `Connect failed (${resp.status})`);
  if (!data.agentUrl?.trim()) {
    throw new Error("Hosted agent URL was not returned");
  }
  if (!data.sessionToken?.trim() && !data.adminToken?.trim()) {
    throw new Error("Hosted agent session was not returned");
  }
  return {
    adminUrl: data.agentUrl.replace(/\/$/, ""),
    adminToken: data.adminToken?.trim() || undefined,
    sessionToken: data.sessionToken?.trim() || undefined,
    handle: data.handle,
    workspaceId: data.workspaceId,
  };
}

/** Create a hosted business/developer workspace and optionally provision its agent. */
export async function createHostedWorkspace(input: {
  kind: "business" | "developer";
  label?: string;
  handle?: string;
}): Promise<{
  workspace: {
    id: string;
    kind: string;
    label: string;
    handle?: string;
    createdAt?: string;
  };
  agent?: {
    agentUrl: string;
    adminToken: string;
    handle: string;
    status: string;
  };
}> {
  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in required");

  const { CONTROL_PLANE_URL } = await import("../hostConfig.js");
  const resp = await fetch(`${CONTROL_PLANE_URL.replace(/\/$/, "")}/workspaces`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      kind: input.kind,
      label: input.label,
      handle: input.handle,
      provisionAgent: true,
    }),
  });
  const data = (await resp.json()) as {
    workspace?: {
      id: string;
      kind: string;
      label: string;
      handle?: string;
      createdAt?: string;
    };
    agent?: {
      agentUrl: string;
      adminToken: string;
      handle: string;
      status: string;
    };
    error?: string;
  };
  if (!resp.ok) throw new Error(data.error ?? `Create workspace failed (${resp.status})`);
  if (!data.workspace) throw new Error("Workspace was not returned");
  return { workspace: data.workspace, agent: data.agent };
}

export type HostedLlmUpdateResult = {
  status: "updated" | "updated_but_unreachable";
  llmProbe?: { ok: boolean; model?: string; error?: string };
};

export async function updateHostedLlmConnection(input: {
  llmApiKey: string;
  llmProvider?: string;
  llmBaseUrl?: string;
  llmModel?: string;
}): Promise<HostedLlmUpdateResult> {
  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in required");

  const key = input.llmApiKey.trim();
  if (!key) throw new Error("LLM API key is required");

  const { CONTROL_PLANE_URL } = await import("../hostConfig.js");
  const resp = await fetch(`${CONTROL_PLANE_URL.replace(/\/$/, "")}/account/llm-key`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      llmApiKey: key,
      llmProvider: input.llmProvider?.trim() || undefined,
      llmBaseUrl: input.llmBaseUrl?.trim() || undefined,
      llmModel: input.llmModel?.trim() || undefined,
    }),
  });
  const data = (await resp.json()) as {
    status?: string;
    error?: string;
    llmProbe?: { ok: boolean; model?: string; error?: string };
  };
  // 502 = key landed on the agent but the provider probe failed — surface as soft failure.
  if (resp.status === 502 && data.status === "updated_but_unreachable") {
    return { status: "updated_but_unreachable", llmProbe: data.llmProbe };
  }
  if (!resp.ok) throw new Error(data.error ?? `Update failed (${resp.status})`);
  return {
    status: "updated",
    llmProbe: data.llmProbe,
  };
}

/** @deprecated Use updateHostedLlmConnection — key-only updates leave OpenRouter base URL unset. */
export async function updateHostedLlmApiKey(llmApiKey: string): Promise<void> {
  await updateHostedLlmConnection({ llmApiKey });
}
