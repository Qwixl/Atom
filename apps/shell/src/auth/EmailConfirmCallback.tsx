import { useEffect, useState } from "react";
import { getSupabaseClient } from "./hostedAccount.js";
import {
  notifyEmailConfirmed,
  wasEmailConfirmationClaimedRecently,
} from "./emailConfirmBridge.js";
import { loadPendingHostedAuth } from "./pendingHostedAuth.js";
import { usesSupabaseHostedAuth } from "../hostConfig.js";
import "./auth-wizard.css";

type EmailConfirmCallbackProps = {
  mode: "register" | "login";
};

type Phase = "processing" | "handoff" | "solo";

export function EmailConfirmCallback({ mode }: EmailConfirmCallbackProps) {
  const [phase, setPhase] = useState<Phase>("processing");

  useEffect(() => {
    if (!usesSupabaseHostedAuth()) {
      window.location.replace(`/app/?auth=${mode}`);
      return;
    }

    let cancelled = false;
    let handled = false;

    const complete = async () => {
      if (cancelled || handled) return;
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) return;

      handled = true;
      notifyEmailConfirmed();

      await new Promise((resolve) => window.setTimeout(resolve, 900));
      if (cancelled) return;

      if (wasEmailConfirmationClaimedRecently()) {
        setPhase("handoff");
        return;
      }

      if (loadPendingHostedAuth()) {
        window.location.replace(`/app/?auth=${mode}`);
        return;
      }

      setPhase("solo");
    };

    const supabase = getSupabaseClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void complete();
    });

    void complete();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [mode]);

  useEffect(() => {
    if (phase !== "handoff") return;
    const timer = window.setTimeout(() => {
      window.close();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const title =
    phase === "processing"
      ? "Confirming your email…"
      : phase === "handoff"
        ? "Email confirmed"
        : "You're signed in";

  const message =
    phase === "processing"
      ? "Hang on while we verify your link."
      : phase === "handoff"
        ? "Your signup tab will continue automatically. You can close this tab."
        : "Email confirmed. Taking you back to Atom…";

  return (
    <div className="chrome-overlay auth-modal-overlay atom-auth-modal" role="dialog" aria-modal="true">
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-header">
          <h2>{title}</h2>
        </div>
        <div className="auth-modal-body">
          <p className="auth-slide-desc">{message}</p>
          {phase === "processing" || phase === "solo" ? (
            <span className="auth-spinner" aria-hidden="true" />
          ) : null}
          {phase === "handoff" ? (
            <div className="auth-actions">
              <button type="button" className="atom-btn atom-btn-secondary" onClick={() => window.close()}>
                Close this tab
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
