import { useEffect, useState } from "react";
import { checkLiveAppAuth } from "./auth/authGate.js";
import { App } from "./App.js";
import { AuthWizard } from "./auth/AuthWizard.js";
import { DemoPeerPage } from "./marketing/DemoPeerPage.js";
import { DemoSessionApp } from "./demo/DemoSessionApp.js";
import { useSearchString } from "./navigation.js";
import { isDemoSessionActive } from "./demo/demoSessionStorage.js";

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

  if (state === "checking" || state === "redirect") return null;
  return <App />;
}

/** React shell only — marketing is static HTML at site root. */
export function RootApp() {
  const search = useSearchString();
  const params = new URLSearchParams(search);
  const auth = params.get("auth");
  const demo = params.get("demo");

  if (auth === "login" || auth === "register") {
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
