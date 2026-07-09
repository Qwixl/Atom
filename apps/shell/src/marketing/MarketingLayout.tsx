import type { ReactNode } from "react";
import { AtomIdent } from "../brand/AtomIdent.js";
import { AtomWordmark } from "../brand/AtomWordmark.js";
import { ThemeToggle } from "../theme/ThemeToggle.js";
import { navigate } from "../navigation.js";
import { DeveloperNavDropdown } from "./DeveloperNavDropdown.js";
import "./marketing.css";

export function MarketingLayout({
  children,
  onLogin,
  onRegister,
}: {
  children: ReactNode;
  onLogin?: () => void;
  onRegister?: () => void;
}) {
  return (
    <div className="atom-marketing">
      <header className="atom-marketing-nav">
        <a
          href="/"
          className="atom-marketing-brand"
          aria-label="Atom home"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          <AtomWordmark className="atom-marketing-wordmark" />
          <AtomIdent className="atom-marketing-ident" />
          <span className="atom-beta-badge">Beta</span>
        </a>
        <nav className="atom-marketing-nav-links" aria-label="Site">
          <a
            href="/demo"
            className="atom-btn atom-btn-ghost"
            onClick={(e) => {
              e.preventDefault();
              navigate("/demo");
            }}
          >
            Demo
          </a>
          <a
            href="/how-it-works"
            className="atom-btn atom-btn-ghost"
            onClick={(e) => {
              e.preventDefault();
              navigate("/how-it-works");
            }}
          >
            How it works
          </a>
          <DeveloperNavDropdown />
          <ThemeToggle />
          <button type="button" className="atom-btn atom-btn-ghost" onClick={onLogin}>
            Log in
          </button>
          <button
            type="button"
            className="atom-btn atom-btn-primary atom-marketing-nav-cta"
            onClick={onRegister}
          >
            Register
          </button>
        </nav>
      </header>
      <main className="atom-marketing-main">{children}</main>
      <footer className="atom-marketing-footer">
        <p className="atom-marketing-footer-tagline">
          Atom by Qwixl — the agent web: agents speak to agents, then report back to you.
        </p>
        <p className="atom-marketing-footer-pricing">
          Free during beta. Paid plans will be disclosed before any charge — no surprises.
        </p>
        <nav className="atom-marketing-footer-links" aria-label="Legal">
          <a
            href="/privacy"
            onClick={(e) => {
              e.preventDefault();
              navigate("/privacy");
            }}
          >
            Privacy
          </a>
          <a
            href="/terms"
            onClick={(e) => {
              e.preventDefault();
              navigate("/terms");
            }}
          >
            Terms
          </a>
          <a href="https://github.com/Qwixl/Atom/blob/main/LICENSE" target="_blank" rel="noreferrer">
            Apache 2.0 License
          </a>
        </nav>
      </footer>
    </div>
  );
}
