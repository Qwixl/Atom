import { navigate } from "../navigation.js";

const LINKS = {
  developers: "/developers",
  github: "https://github.com/Qwixl/Atom",
  developerGuide: "https://github.com/Qwixl/Atom/blob/main/DEVELOPERS.md",
  modules: "https://github.com/Qwixl/Atom/blob/main/MODULES.md",
  embed: "https://github.com/Qwixl/Atom/blob/main/EMBED.md",
  cli: "https://www.npmjs.com/package/@qwixl/atom-cli",
  demoPeer: "https://github.com/Qwixl/Atom/blob/main/DEMO-PEER.md",
};

export function DeveloperNavDropdown() {
  return (
    <details className="atom-nav-dropdown">
      <summary className="atom-btn atom-btn-ghost">Developer</summary>
      <div className="atom-nav-dropdown-menu" role="menu">
        <button type="button" role="menuitem" onClick={() => navigate("/developers")}>
          Platform overview
        </button>
        <a href={LINKS.developerGuide} target="_blank" rel="noreferrer" role="menuitem">
          Developer guide
        </a>
        <a href={LINKS.modules} target="_blank" rel="noreferrer" role="menuitem">
          Build modules
        </a>
        <a href={LINKS.embed} target="_blank" rel="noreferrer" role="menuitem">
          Embed the shell
        </a>
        <a href={LINKS.cli} target="_blank" rel="noreferrer" role="menuitem">
          CLI on npm
        </a>
        <a href={LINKS.github} target="_blank" rel="noreferrer" role="menuitem">
          GitHub repository
        </a>
      </div>
    </details>
  );
}
