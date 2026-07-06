import { useEffect, useState } from "react";
import { checkLiveAppAuth } from "./auth/authGate.js";
import { App } from "./App.js";
import { AuthWizard } from "./auth/AuthWizard.js";
import { EmailConfirmCallback } from "./auth/EmailConfirmCallback.js";
import { hasSupabaseAuthCallbackInUrl } from "./auth/emailConfirmBridge.js";
import { DemoPeerPage } from "./marketing/DemoPeerPage.js";
import { DemoSessionApp } from "./demo/DemoSessionApp.js";
import { useSearchString } from "./navigation.js";
import { isDemoSessionActive } from "./demo/demoSessionStorage.js";
import "./auth/auth-wizard.css";

function LiveAppGate() {
  const [state, setState] = useState<"checking" | "ready" | "redirect">("checking");

  useEffect(() => {
    void checkLiveAppAuth().then((result) => {
      if (result.status === "redirect") {
        window.location.replace(result.href);
        setState("redirect");
      } else if (result.status === "ready") {
        setState("ready");
      }
    });
  }, []);

  if (state === "checking" || state === "redirect") {
    return (
      <div className="chrome-overlay auth-modal-overlay atom-auth-modal" role="status" aria-live="polite">
        <div className="auth-modal">
          <div className="auth-modal-body">
            <p className="auth-slide-desc">Loading Atom…</p>
            <span className="auth-spinner" aria-hidden="true" />
          </div>
        </div>
      </div>
    );
  }
  return <App />;
}

/** React shell only — marketing is static HTML at site root. */
export function RootApp() {
  const search = useSearchString();
  const params = new URLSearchParams(search);
  const auth = params.get("auth");
  const demo = params.get("demo");

  if (auth === "login" || auth === "register") {
    if (hasSupabaseAuthCallbackInUrl()) {
      return <EmailConfirmCallback mode={auth} />;
    }
    return (
      <AuthWizard
        mode={auth}
        onClose={() => {
          window.location.href = "/";
        }}
      />
    );
  }

  if (demo === "1") {
    return (
      <DemoPeerPage
        onComplete={() => {
          window.location.href = "/app/?demo=session";
        }}
      />
    );
  }

  if (demo === "session") {
    if (!isDemoSessionActive()) {
      window.location.replace("/app/?demo=1");
      return null;
    }
    return <DemoSessionApp />;
  }

  return <LiveAppGate />;
}
