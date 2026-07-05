import { useEffect, useState } from "react";
import { bootstrapPersonalDemo } from "./personalDemoBootstrap.js";
import { IS_DEMO_MODE } from "./demoPersonas.js";

export function DemoBootstrap({
  onReady,
  onError,
}: {
  onReady: () => void;
  onError: (message: string) => void;
}) {
  const [status, setStatus] = useState("Checking your personal agent…");

  useEffect(() => {
    if (!IS_DEMO_MODE) return;

    let cancelled = false;

    async function run() {
      try {
        setStatus("Checking your personal agent…");
        await bootstrapPersonalDemo();
        if (!cancelled) onReady();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!cancelled) {
          setStatus(message);
          onError(message);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [onError, onReady]);

  if (!IS_DEMO_MODE) return null;

  return (
    <div className="chrome-overlay demo-bootstrap-overlay" role="dialog" aria-modal="true">
      <div className="settings-dialog first-run-dialog">
        <div className="settings-dialog-header">
          <h2>Setting up your demo</h2>
        </div>
        <div className="settings-dialog-body">
          <p className="settings-note demo-intro">
            Your personal agent backend on port <strong>5204</strong> must be running from{" "}
            <code>pnpm dev:demo</code>. This demo uses your LLM key, your calendar feed, and your
            real Google Calendar — not a fake second user.
          </p>
          <p className="settings-note">{status}</p>
          {status.toLowerCase().includes("not reachable") || status.toLowerCase().includes("failed to fetch") ? (
            <p className="settings-note demo-bootstrap-hint">
              Check the terminal running <code>pnpm dev:demo</code> for agent crashes. Stop the stack
              (Ctrl+C) and start it again if the agent on port 5204 exited.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
