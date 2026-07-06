import { MarketingLayout } from "./MarketingLayout.js";
import { navigate } from "../navigation.js";

export function TermsPage() {
  return (
    <MarketingLayout onLogin={() => navigate("/?auth=login")} onRegister={() => navigate("/?auth=register")}>
      <article className="atom-page atom-legal">
        <h1>Terms of use</h1>
        <p className="atom-note">Last updated: July 2026 · Beta</p>

        <section>
          <h2>Beta service</h2>
          <p>
            Atom is in beta. Features, uptime, and pricing may change. The service is provided as-is
            during this period. We will give reasonable notice before introducing paid plans or
            material breaking changes.
          </p>
        </section>

        <section>
          <h2>Pricing during beta</h2>
          <p>
            Hosted accounts are <strong>free during beta</strong>. Before any billing starts we will
            publish fees, include them in-product, and require explicit acceptance. Self-hosted use
            of open-source components remains governed by the Apache 2.0 license.
          </p>
        </section>

        <section>
          <h2>Acceptable use</h2>
          <p>
            Do not use Atom to spam, attack, or impersonate others. Do not attempt to bypass shell
            confirmation chrome or module sandboxes. Abuse may result in account suspension on hosted
            infrastructure.
          </p>
        </section>

        <section>
          <h2>Software license</h2>
          <p>
            Open-source packages in the Atom repository are licensed under{" "}
            <a href="https://github.com/Qwixl/Atom/blob/main/LICENSE" target="_blank" rel="noreferrer">
              Apache License 2.0
            </a>
            .
          </p>
        </section>
      </article>
    </MarketingLayout>
  );
}
