import { useEffect, useState } from "react";
import { checkLiveAppAuth } from "./auth/authGate.js";
import { App } from "./App.js";
import { AuthWizard } from "./auth/AuthWizard.js";
import { EmailConfirmCallback } from "./auth/EmailConfirmCallback.js";
import { hasSupabaseAuthCallbackInUrl } from "./auth/emailConfirmBridge.js";
import { DemoPeerPage } from "./demo/DemoPeerPage.js";
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

/** React shell only — commercial marketing lives in private Atom-MC. */
export function RootApp() {
  const search = useSearchString();
  const params = new URLSearchParams(search);
  const auth = params.get("auth");
  const billing = params.get("billing");
  const demo = params.get("demo");
  const embedded = params.get("embed") === "1";

  // Stripe plan checkout returns here; resume register wizard (provision or cancel message).
  const billingRegister =
    billing === "plan-success" || billing === "plan-cancel"
      ? ("register" as const)
      : null;
  const wizardMode =
    auth === "login" || auth === "register" ? auth : billingRegister;

  if (wizardMode) {
    if (hasSupabaseAuthCallbackInUrl()) {
      return <EmailConfirmCallback mode={wizardMode === "login" ? "login" : "register"} />;
    }
    return (
      <AuthWizard
        mode={wizardMode}
        embedded={embedded}
        onClose={() => {
          if (embedded) {
            window.parent.postMessage({ source: "atom-auth", type: "close" }, "*");
            return;
          }
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
