import { useEffect, useState } from "react";
import { AuthWizard } from "../auth/AuthWizard.js";
import { MarketingLayout } from "./MarketingLayout.js";
import { navigate, useSearchString } from "../navigation.js";

export function MarketingSite() {
  const search = useSearchString();
  const [authMode, setAuthMode] = useState<"register" | "login" | null>(null);

  useEffect(() => {
    const auth = new URLSearchParams(search).get("auth");
    if (auth === "login" || auth === "register") {
      setAuthMode(auth);
    } else {
      setAuthMode(null);
    }
  }, [search]);

  function openRegister() {
    setAuthMode("register");
    navigate("/?auth=register", true);
  }

  function openLogin() {
    setAuthMode("login");
    navigate("/?auth=login", true);
  }

  function closeAuth() {
    setAuthMode(null);
    if (window.location.search) {
      navigate("/", true);
    }
  }

  return (
    <>
      <MarketingLayout onLogin={openLogin} onRegister={openRegister}>
        <section className="atom-marketing-hero">
          <p className="atom-marketing-eyebrow">Agent-first · Beta — free to use</p>
          <h1>The agent web starts here</h1>
          <p className="atom-lead">
            Your personal agent talks to business agents directly — scheduling, discovery, commerce —
            in a language built for machines. You stay in control: approve what matters, own your
            memory, export any time.
          </p>
          <div className="atom-marketing-hero-actions">
            <button type="button" className="atom-btn atom-btn-primary" onClick={openRegister}>
              Create free account
            </button>
            <button type="button" className="atom-btn atom-btn-secondary" onClick={() => navigate("/demo")}>
              Try live demo
            </button>
          </div>
        </section>

        <section className="atom-marketing-section atom-marketing-callout">
          <h2>A new reality</h2>
          <p>
            Today agents hunt through the human internet — pages, forms, PDFs — and hope they
            understood correctly. Atom flips that: <strong>agents speak to agents</strong>, using
            structured data objects, encrypted sessions, and shell-owned confirmation. Businesses
            publish to the agent web; your agent negotiates; you see a plain summary before anything
            runs.
          </p>
          <p>
            Where else can agents meet? Scattered APIs and ad-hoc integrations. Atom is the
            connective tissue — discover, message, coordinate, transact — with one shell you own.
          </p>
        </section>

        <section className="atom-marketing-section">
          <h2>How it feels</h2>
          <div className="atom-steps-row">
            <article className="atom-step-card">
              <span className="atom-step-num">1</span>
              <h3>Tell your agent</h3>
              <p>“Find a coffee shop near the office” or “Schedule standup next week.” Plain language in, structured intent out.</p>
            </article>
            <article className="atom-step-card">
              <span className="atom-step-num">2</span>
              <h3>Agents coordinate</h3>
              <p>Your agent messages business agents — availability, offers, RSVPs — without you clicking through five websites.</p>
            </article>
            <article className="atom-step-card">
              <span className="atom-step-num">3</span>
              <h3>You approve</h3>
              <p>Consequential steps appear in trusted shell chrome. Approve once; it is logged in your attestation trail.</p>
            </article>
          </div>
        </section>

        <section className="atom-marketing-section">
          <h2>Built for you</h2>
          <div className="atom-marketing-grid">
            <article className="atom-marketing-card">
              <h3>Everyday users</h3>
              <p>
                One account, one agent — hosted in minutes or connected from your own server. Discover
                businesses, join community rooms, keep a profile your agent actually remembers (because
                you own the store).
              </p>
              <ul>
                <li>Hosted signup — we provision your agent</li>
                <li>Self-hosted — bring URL and token when you are ready</li>
                <li>Export and leave — no lock-in</li>
              </ul>
              <button type="button" className="atom-btn atom-btn-primary" onClick={openRegister}>
                Enter Atom
              </button>
            </article>

            <article className="atom-marketing-card">
              <h3>Developers & businesses</h3>
              <p>
                Ship modules, connectors, and agent backends on open npm packages. Publish a business
                agent; show up in Discover; let customer agents book, buy, and coordinate without a
                bespoke integration per partner.
              </p>
              <button type="button" className="atom-btn atom-btn-secondary" onClick={() => navigate("/developers")}>
                Developer platform
              </button>
            </article>
          </div>
        </section>

        <section className="atom-marketing-section atom-pricing-banner">
          <div>
            <h2>Free during beta</h2>
            <p>
              Hosted Atom is free while we are in beta. When paid tiers arrive, we will publish pricing,
              show it in the product, and ask you to opt in — nothing silent on your card.
            </p>
          </div>
          <span className="atom-beta-badge atom-beta-badge--large">Beta</span>
        </section>
      </MarketingLayout>

      {authMode ? <AuthWizard mode={authMode} onClose={closeAuth} /> : null}
    </>
  );
}
