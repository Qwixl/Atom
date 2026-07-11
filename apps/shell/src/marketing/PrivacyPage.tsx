import { MarketingLayout } from "./MarketingLayout.js";
import { navigate } from "../navigation.js";

export function PrivacyPage() {
  return (
    <MarketingLayout onLogin={() => navigate("/?auth=login")} onRegister={() => navigate("/?auth=register")}>
      <article className="atom-page atom-legal">
        <h1>Privacy</h1>
        <p className="atom-note">Last updated: July 2026 · Beta</p>
        <p>
          This page summarizes how Qwixl handles data for Atom. The full notice is also published at{" "}
          <a href="/privacy/">/privacy/</a> (canonical for crawlers and Microsoft attestation).
        </p>

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
            <li>
              If you connect Microsoft 365: OAuth tokens in the encrypted agent vault, and
              short-lived Graph read results needed for a turn (not a durable mailbox warehouse)
            </li>
          </ul>
        </section>

        <section>
          <h2>Microsoft 365 / Graph</h2>
          <ul>
            <li>Refresh tokens stay vault-only — not returned to the shell, modules, or model context</li>
            <li>Qwixl does not train models on Microsoft organizational data (mail, calendar, tasks)</li>
            <li>Disconnect revokes tokens where Microsoft allows and deletes vault slots and related cache</li>
            <li>Minimum tool results may go to your chosen LLM provider under that provider’s terms</li>
          </ul>
        </section>

        <section>
          <h2>Subprocessors (hosted)</h2>
          <ul>
            <li>Supabase — authentication and account database</li>
            <li>DigitalOcean — control plane and per-owner agent containers</li>
            <li>Vercel — hosted shell and registry</li>
            <li>Stripe — payments when paid plans are enabled</li>
            <li>Owner-chosen LLM providers and Microsoft (when you connect Graph)</li>
          </ul>
        </section>

        <section>
          <h2>Retention (highlights)</h2>
          <ul>
            <li>Account data — life of the account</li>
            <li>Abuse / signup metadata — typically up to 90 days</li>
            <li>Graph invoke cache — minutes (server-capped)</li>
            <li>Encrypted backups — rolling window up to 35 days (target)</li>
          </ul>
        </section>

        <section>
          <h2>What we do not do</h2>
          <ul>
            <li>Sell your conversation content to advertisers</li>
            <li>Train Qwixl foundation models on your agent store or Microsoft payloads</li>
            <li>Let modules access the shell trust boundary without sandboxing</li>
            <li>Execute consequential actions without shell-owned confirmation chrome</li>
          </ul>
        </section>

        <section>
          <h2>Your rights</h2>
          <p>
            Access, correction, deletion, export, and restriction requests:{" "}
            <a href="mailto:support@qwixl.com">support@qwixl.com</a>. Encrypted export is available
            from Settings where supported.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Privacy questions:{" "}
            <a href="mailto:support@qwixl.com">support@qwixl.com</a>. Full policy:{" "}
            <a href="/privacy/">atom.qwixl.com/privacy/</a>.
          </p>
        </section>
      </article>
    </MarketingLayout>
  );
}
