import { useState } from "react";
import {
  bootstrapHostedAccount,
  fetchHostedAgentConnection,
  getSupabaseClient,
  type AtomAccountType,
} from "./hostedAccount.js";
import { saveValidatedAgentConnection } from "../comms/agentConnection.js";
import {
  saveCommsAgentConfigSecure,
  saveOwnerAgentKind,
} from "../comms/storage.js";
import { bareOwnerHandle, normalizeOwnerHandle, validateOwnerHandle } from "../ownerHandle.js";
import { saveOwnerHandle } from "../ownerHandle.js";
import { markFirstRunDone } from "../firstRunStorage.js";
import { FieldLabelWithHint, LlmApiKeyHintContent } from "../ui/FieldHint.js";

type AuthMode = "signup" | "login";

const ACCOUNT_TYPES: { id: AtomAccountType; label: string; hint: string }[] = [
  { id: "user", label: "User", hint: "Personal agent" },
  { id: "business", label: "Business", hint: "Brand + catalog agent" },
  { id: "developer", label: "Developer", hint: "Build and ship modules" },
];

export function HostedAuthScreen({
  onDone,
}: {
  onDone: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [accountType, setAccountType] = useState<AtomAccountType>("user");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function wireAgentAfterAuth(): Promise<void> {
    const connection = await fetchHostedAgentConnection();
    await saveValidatedAgentConnection({
      adminUrl: connection.adminUrl,
      adminToken: connection.adminToken,
    });
    await saveCommsAgentConfigSecure({
      adminUrl: connection.adminUrl,
      adminToken: connection.adminToken,
    });
    saveOwnerAgentKind("hosted");
    if (connection.handle) saveOwnerHandle(connection.handle);
    markFirstRunDone();
    onDone();
  }

  async function submitSignup() {
    const handleError = validateOwnerHandle(handle);
    if (handleError) {
      setStatus(handleError);
      return;
    }
    if (!llmApiKey.trim()) {
      setStatus("Add your LLM API key to continue.");
      return;
    }
    if (password.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      const supabase = getSupabaseClient();
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpError) throw signUpError;

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;

      await bootstrapHostedAccount({
        handle: bareOwnerHandle(handle),
        accountType,
        llmApiKey: llmApiKey.trim(),
      });
      await wireAgentAfterAuth();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin() {
    setBusy(true);
    setStatus(null);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      await wireAgentAfterAuth();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="first-run-panel">
      <h2>{mode === "signup" ? "Create your account" : "Log in"}</h2>
      <p className="muted">
        Your agent runs on Qwixl infrastructure. You can export and self-host from Settings any time.
      </p>

      <div className="first-run-tabs">
        <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
          Sign up
        </button>
        <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
          Log in
        </button>
      </div>

      <label className="field">
        <span>Email</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label className="field">
        <span>Password</span>
        <input
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      {mode === "signup" ? (
        <>
          <fieldset className="field">
            <legend>Account type</legend>
            {ACCOUNT_TYPES.map((type) => (
              <label key={type.id} className="radio-row">
                <input
                  type="radio"
                  name="accountType"
                  checked={accountType === type.id}
                  onChange={() => setAccountType(type.id)}
                />
                <span>
                  <strong>{type.label}</strong> — {type.hint}
                </span>
              </label>
            ))}
          </fieldset>

          <label className="field">
            <span>Handle</span>
            <input
              value={handle}
              onChange={(e) => setHandle(normalizeOwnerHandle(e.target.value))}
              placeholder="@you"
            />
          </label>

          <label className="field">
            <FieldLabelWithHint label="LLM API key" hint={<LlmApiKeyHintContent />} />
            <input
              type="password"
              autoComplete="off"
              value={llmApiKey}
              onChange={(e) => setLlmApiKey(e.target.value)}
              placeholder="sk-…"
            />
          </label>

          <button type="button" className="primary" disabled={busy} onClick={() => void submitSignup()}>
            {busy ? "Creating account…" : "Create account"}
          </button>
        </>
      ) : (
        <button type="button" className="primary" disabled={busy} onClick={() => void submitLogin()}>
          {busy ? "Signing in…" : "Log in"}
        </button>
      )}

      {status ? <p className="status error">{status}</p> : null}
    </div>
  );
}
