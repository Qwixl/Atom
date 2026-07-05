import { SHOW_DEV_WORKFLOWS } from "../hostConfig.js";
import { IconMenu } from "./ShellIcons.js";

type Provider = "mock" | "llm" | "ag-ui";

export type ShellNavPanel = "none" | "log" | "profile" | "comms" | "discover" | "rooms";

const PANEL_TITLES: Record<ShellNavPanel, string> = {
  none: "Chat",
  comms: "Messages",
  discover: "Discover",
  rooms: "Rooms",
  profile: "Profile",
  log: "Attestation log",
};

type ShellMainHeaderProps = {
  panel: ShellNavPanel;
  ownerAgentSummary: string;
  vaultUnlocked: boolean;
  registryError: string | null;
  modulesEnabled: boolean;
  onToggleModules: () => void;
  provider: Provider;
  onSwitchProvider: (provider: Provider) => void;
  allowBrowserLlm: boolean;
  settingsIntent: Provider | null;
  onOpenMobileNav: () => void;
  showChatProviderControls: boolean;
};

export function ShellMainHeader({
  panel,
  ownerAgentSummary,
  vaultUnlocked,
  registryError,
  modulesEnabled,
  onToggleModules,
  provider,
  onSwitchProvider,
  allowBrowserLlm,
  settingsIntent,
  onOpenMobileNav,
  showChatProviderControls,
}: ShellMainHeaderProps) {
  return (
    <header className="shell-main-header">
      <div className="shell-main-header-primary">
        <div className="shell-main-header-start">
          <button
            type="button"
            className="shell-mobile-nav-toggle"
            aria-label="Open navigation menu"
            onClick={onOpenMobileNav}
          >
            <IconMenu />
          </button>
          <div className="shell-main-header-titles">
            <h1 className="shell-main-header-title">{PANEL_TITLES[panel]}</h1>
            <p className="shell-main-header-subtitle">{ownerAgentSummary}</p>
          </div>
        </div>

        <div className="shell-main-header-meta" aria-label="Shell status">
          {registryError ? (
            <span className="shell-meta-item shell-meta-item-warn" title={registryError}>
              <span className="shell-meta-dot shell-meta-dot-warn" aria-hidden="true" />
              Registry
            </span>
          ) : null}
          <span className="shell-meta-item">
            <span
              className={`shell-meta-dot${vaultUnlocked ? " shell-meta-dot-good" : " shell-meta-dot-warn"}`}
              aria-hidden="true"
            />
            {vaultUnlocked ? "Vault unlocked" : "Vault locked"}
          </span>
          <button
            type="button"
            className={`shell-meta-toggle${modulesEnabled ? " is-on" : ""}`}
            onClick={onToggleModules}
            aria-pressed={modulesEnabled}
          >
            Modules {modulesEnabled ? "on" : "off"}
          </button>
        </div>
      </div>

      {showChatProviderControls ? (
        <div className="shell-main-header-secondary">
          <span className="shell-toolbar-label">Composer</span>
          <div className="shell-segmented" role="group" aria-label="Chat composer provider">
            {SHOW_DEV_WORKFLOWS ? (
              <button
                type="button"
                className={provider === "mock" ? "is-active" : ""}
                onClick={() => onSwitchProvider("mock")}
                title="Canned responses for local UI testing only"
              >
                Mock
              </button>
            ) : null}
            {allowBrowserLlm ? (
              <button
                type="button"
                className={provider === "llm" || settingsIntent === "llm" ? "is-active" : ""}
                onClick={() => onSwitchProvider("llm")}
              >
                Live LLM
              </button>
            ) : null}
            <button
              type="button"
              className={provider === "ag-ui" || settingsIntent === "ag-ui" ? "is-active" : ""}
              onClick={() => onSwitchProvider("ag-ui")}
            >
              AG-UI
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
