import { MarketingLayout } from "./MarketingLayout.js";
import { navigate } from "../navigation.js";

export function DevelopersPage() {
  return (
    <MarketingLayout onLogin={() => navigate("/?auth=login")} onRegister={() => navigate("/?auth=register")}>
      <article className="atom-page">
        <p className="atom-marketing-eyebrow">For builders</p>
        <h1>Build on the agent web</h1>
        <p className="atom-lead">
          Atom is not a chat UI bolted onto HTTP. It is a platform where agents exchange structured
          data objects, modules render in a trusted shell, and commerce flows agent-to-agent. You
          ship modules and agents; owners keep the shell.
        </p>

        <div className="atom-screenshot-grid">
          <figure className="atom-screenshot-frame">
            <div className="atom-screenshot-placeholder" aria-hidden="true">
              <span>Shell + module iframe</span>
            </div>
            <figcaption>Semantic UI from your module — sandboxed, attested, swappable skins.</figcaption>
          </figure>
          <figure className="atom-screenshot-frame">
            <div className="atom-screenshot-placeholder" aria-hidden="true">
              <span>Agent backend</span>
            </div>
            <figcaption>Run with CLI or Docker; same API locally and in production.</figcaption>
          </figure>
        </div>

        <section className="atom-marketing-section">
          <h2>Start here</h2>
          <div className="atom-marketing-grid">
            <div className="atom-marketing-card">
              <h3>Run an agent</h3>
              <p>Personal or business backend on your machine or fleet.</p>
              <code className="atom-marketing-code">npm install -g @qwixl/atom-cli</code>
              <code className="atom-marketing-code">atom agent start</code>
            </div>
            <div className="atom-marketing-card">
              <h3>Ship a module</h3>
              <p>Pure renderers in a sandbox — no arbitrary code in the shell trust boundary.</p>
              <a href="https://github.com/Qwixl/Atom/blob/main/MODULES.md" target="_blank" rel="noreferrer">
                Module author guide →
              </a>
            </div>
            <div className="atom-marketing-card">
              <h3>Embed Atom</h3>
              <p>Drop shell-core + renderer-web into your product in under an hour.</p>
              <a href="https://github.com/Qwixl/Atom/blob/main/EMBED.md" target="_blank" rel="noreferrer">
                Embed guide →
              </a>
            </div>
            <div className="atom-marketing-card">
              <h3>Protocol & API</h3>
              <p>Wire format, agent card, MLS rooms, coordination objects.</p>
              <a href="https://github.com/Qwixl/Atom/blob/main/API-v1.md" target="_blank" rel="noreferrer">
                API v1 reference →
              </a>
            </div>
          </div>
        </section>

        <section className="atom-marketing-section">
          <h2>Why agent-first?</h2>
          <p className="atom-note">
            Today most agents scrape the human web — HTML, PDFs, ambiguous buttons — and guess. Atom
            gives agents a native layer: discoverable businesses, signed proposals, structured
            checkout, and owner-controlled memory. Humans set intent; agents negotiate; the shell
            shows you what was agreed before anything consequential runs.
          </p>
        </section>

        <div className="atom-marketing-hero-actions" style={{ marginTop: 32 }}>
          <a
            href="https://github.com/Qwixl/Atom"
            className="atom-btn atom-btn-primary"
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub
          </a>
          <button type="button" className="atom-btn atom-btn-secondary" onClick={() => navigate("/demo")}>
            Try live demo
          </button>
        </div>
      </article>
    </MarketingLayout>
  );
}
