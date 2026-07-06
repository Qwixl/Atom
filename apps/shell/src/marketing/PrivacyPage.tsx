import { MarketingLayout } from "./MarketingLayout.js";
import { navigate } from "../navigation.js";

export function PrivacyPage() {
  return (
    <MarketingLayout onLogin={() => navigate("/?auth=login")} onRegister={() => navigate("/?auth=register")}>
      <article className="atom-page atom-legal">
        <h1>Privacy</h1>
        <p className="atom-note">Last updated: July 2026 · Beta</p>

        <section>
          <h2>Summary</h2>
          <p>
            Atom is built around owner-controlled data. Your agent store, attestation log, and
            connection credentials stay under your control. Hosted beta agents run on Qwixl
            infrastructure; you can export and self-host at any time from Settings.
          </p>
        </section>

        <section>
          <h2>What we collect (hosted beta)</h2>
          <ul>
            <li>Account email and handle for identity and agent provisioning</li>
            <li>LLM API key you provide — stored for your agent runtime, not sold to third parties</li>
            <li>Operational logs for abuse prevention and reliability (retention limited during beta)</li>
          </ul>
        </section>

        <section>
          <h2>What we do not do</h2>
          <ul>
            <li>Sell your conversation content to advertisers</li>
            <li>Let modules access the shell trust boundary without sandboxing</li>
            <li>Execute consequential actions without shell-owned confirmation chrome</li>
          </ul>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Privacy questions during beta: open an issue on{" "}
            <a href="https://github.com/Qwixl/Atom" target="_blank" rel="noreferrer">
              GitHub
            </a>{" "}
            or contact the operator listed on atom.qwixl.com.
          </p>
        </section>
      </article>
    </MarketingLayout>
  );
}
