import { useCallback, useId, useRef, useState } from "react";
import { AtomIdent } from "../brand/AtomIdent.js";
import { AtomWordmark } from "../brand/AtomWordmark.js";
import type { ShellNavPanel } from "./ShellSidebar.js";
import { GamesMenu, type GamesMenuItem } from "./GamesMenu.js";
import {
  IconChat,
  IconChevronDown,
  IconChevronRight,
  IconDiscover,
  IconExit,
  IconGames,
  IconMenu,
  IconMessages,
  IconProfile,
  IconRooms,
  IconSettings,
} from "./ShellIcons.js";

export type SettingsOpenTarget = "profile" | "log" | "default";

type NavItem = {
  id: ShellNavPanel;
  label: string;
  icon: typeof IconChat;
  badge?: number;
  badgeTone?: "default" | "warn";
  locked?: boolean;
};

type AtomShellProps = {
  section: ShellNavPanel;
  onNavigate: (section: ShellNavPanel) => void;
  onOpenSettings: (target?: SettingsOpenTarget) => void;
  onOpenAccount: () => void;
  onLogout?: () => void;
  settingsLabel?: string;
  badges?: Partial<Record<ShellNavPanel, { count: number; tone?: "default" | "warn" }>>;
  status?: React.ReactNode;
  banner?: React.ReactNode;
  headerActions?: React.ReactNode;
  /** Shell-arbitrated games available in the trusted catalog. */
  games?: readonly GamesMenuItem[];
  onStartGame?: (moduleId: string) => void;
  composer?: React.ReactNode;
  lockedSections?: ShellNavPanel[];
  showDemoTag?: boolean;
  variant?: "default" | "demo";
  children: React.ReactNode;
};

/** Primary sections shown in desktop tabs and the mobile hamburger. */
const PRIMARY_NAV: Omit<NavItem, "badge" | "locked">[] = [
  { id: "none", label: "Chat", icon: IconChat },
  { id: "comms", label: "Messages", icon: IconMessages },
  { id: "discover", label: "Discover", icon: IconDiscover },
  { id: "rooms", label: "Rooms", icon: IconRooms },
];

type PopoverElement = HTMLElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
  togglePopover?: () => void;
};

function NavButton({
  item,
  active,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  onSelect: (id: ShellNavPanel) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={`atom-nav-item${active ? " is-active" : ""}${item.locked ? " is-locked" : ""}`}
      aria-current={active ? "page" : undefined}
      disabled={item.locked}
      title={item.locked ? "Not available in demo" : undefined}
      onClick={() => onSelect(item.id)}
    >
      <Icon className="atom-nav-icon" />
      <span className="atom-nav-label">{item.label}</span>
      {item.badge ? (
        <span className={`atom-nav-badge${item.badgeTone === "warn" ? " atom-nav-badge--warn" : ""}`}>
          {item.badge}
        </span>
      ) : null}
    </button>
  );
}

function withBadges(
  entries: Omit<NavItem, "badge" | "locked">[],
  badges: AtomShellProps["badges"],
  locked: Set<ShellNavPanel>,
): NavItem[] {
  return entries.map((entry) => ({
    ...entry,
    badge: badges?.[entry.id]?.count,
    badgeTone: badges?.[entry.id]?.tone,
    locked: locked.has(entry.id),
  }));
}

export function AtomShell({
  section,
  onNavigate,
  onOpenSettings,
  onOpenAccount,
  onLogout,
  settingsLabel = "Settings",
  badges = {},
  status,
  banner,
  headerActions,
  games = [],
  onStartGame,
  composer,
  lockedSections = [],
  showDemoTag = false,
  variant = "default",
  children,
}: AtomShellProps) {
  const locked = new Set(lockedSections);
  const stageRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<PopoverElement | null>(null);
  const popoverId = useId().replace(/:/g, "");
  const navPopoverId = `atom-nav-menu-${popoverId}`;
  const [gamesOpen, setGamesOpen] = useState(false);

  const primaryItems = withBadges(PRIMARY_NAV, badges, locked);
  const mobileMenuItems = primaryItems;

  const setPopoverNode = useCallback((node: HTMLDivElement | null) => {
    popoverRef.current = node;
    if (node && !node.hasAttribute("popover")) {
      node.setAttribute("popover", "auto");
    }
  }, []);

  function toggleNavMenu() {
    const el = popoverRef.current;
    if (!el?.togglePopover) return;
    try {
      el.togglePopover();
    } catch {
      /* unsupported */
    }
  }

  function hideNavMenu() {
    const el = popoverRef.current;
    if (!el?.hidePopover) return;
    try {
      el.hidePopover();
    } catch {
      /* already closed */
    }
    setGamesOpen(false);
  }

  function selectSection(id: ShellNavPanel) {
    if (locked.has(id)) return;
    onNavigate(id);
    hideNavMenu();
  }

  function openSettings(target: SettingsOpenTarget = "default") {
    hideNavMenu();
    onOpenSettings(target);
  }

  const menuBadgeTotal = mobileMenuItems.reduce((sum, item) => sum + (item.badge ?? 0), 0);

  return (
    <div className={`atom-app${variant === "demo" ? " atom-app--demo" : ""}`}>
      <header className="atom-app-header site-header">
        <div className="atom-app-header-inner">
          <a className="site-brand atom-brand-link" href="/" aria-label="Atom home">
            <AtomIdent className="atom-brand-ident" />
            <AtomWordmark className="atom-brand-wordmark" />
            {showDemoTag ? <span className="demo-tag">Demo</span> : null}
          </a>

          <nav className="atom-app-tabs" aria-label="Sections">
            {primaryItems.map((item) => (
              <NavButton key={item.id} item={item} active={section === item.id} onSelect={selectSection} />
            ))}
            {onStartGame ? (
              <GamesMenu games={games} onSelect={onStartGame} className="atom-games-menu--tab" />
            ) : null}
          </nav>

          <div className="atom-app-header-end">
            {headerActions}
            {status}
            <button
              type="button"
              className="atom-app-menu-trigger"
              aria-label="Open menu"
              title="Menu"
              aria-controls={navPopoverId}
              onClick={toggleNavMenu}
            >
              <IconMenu className="atom-menu-lines" />
              {menuBadgeTotal > 0 ? (
                <span className="atom-nav-badge atom-menu-trigger-badge" aria-hidden="true">
                  {menuBadgeTotal > 9 ? "9+" : menuBadgeTotal}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="btn btn-ghost atom-app-account panel-btn-icon"
              aria-label="Account"
              title="Account"
              onClick={() => {
                hideNavMenu();
                onOpenAccount();
              }}
            >
              <IconProfile className="atom-nav-icon" />
            </button>
            <button
              type="button"
              className="btn btn-ghost atom-app-settings panel-btn-icon"
              aria-label={settingsLabel}
              title={settingsLabel}
              onClick={() => openSettings("default")}
            >
              <IconSettings className="atom-nav-icon" />
            </button>
          </div>
        </div>
      </header>

      <div id={navPopoverId} ref={setPopoverNode} className="atom-nav-popover">
        <nav className="atom-nav-popover-nav" aria-label="Sections">
          {mobileMenuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`atom-nav-popover-item${section === item.id ? " is-active" : ""}${item.locked ? " is-locked" : ""}`}
                aria-current={section === item.id ? "page" : undefined}
                disabled={item.locked}
                onClick={() => selectSection(item.id)}
              >
                <Icon className="atom-nav-icon" />
                <span>{item.label}</span>
                {item.badge ? (
                  <span
                    className={`atom-nav-badge${item.badgeTone === "warn" ? " atom-nav-badge--warn" : ""}`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
          {onStartGame && games.length > 0 ? (
            <div className="atom-nav-popover-games">
              <button
                type="button"
                className={`atom-nav-popover-item atom-nav-popover-games-toggle${gamesOpen ? " is-open" : ""}`}
                aria-expanded={gamesOpen}
                onClick={() => setGamesOpen((open) => !open)}
              >
                <IconGames className="atom-nav-icon atom-games-icon" />
                <span>Games</span>
                {gamesOpen ? (
                  <IconChevronDown className="atom-nav-popover-chevron" />
                ) : (
                  <IconChevronRight className="atom-nav-popover-chevron" />
                )}
              </button>
              {gamesOpen ? (
                <div className="atom-nav-popover-submenu" role="group" aria-label="Games">
                  {games.map((game) => (
                    <button
                      key={game.moduleId}
                      type="button"
                      className="atom-nav-popover-item atom-nav-popover-subitem"
                      onClick={() => {
                        hideNavMenu();
                        setGamesOpen(false);
                        onStartGame(game.moduleId);
                      }}
                    >
                      <span>{game.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            className="atom-nav-popover-item"
            onClick={() => {
              hideNavMenu();
              onOpenAccount();
            }}
          >
            <IconProfile className="atom-nav-icon" />
            <span>Account</span>
          </button>
          <button
            type="button"
            className="atom-nav-popover-item"
            onClick={() => openSettings("default")}
          >
            <IconSettings className="atom-nav-icon" />
            <span>{settingsLabel}</span>
          </button>
          {onLogout ? (
            <button
              type="button"
              className="atom-nav-popover-item atom-nav-popover-exit"
              onClick={() => {
                hideNavMenu();
                onLogout();
              }}
            >
              <IconExit className="atom-nav-icon" />
              <span>← Exit</span>
            </button>
          ) : null}
        </nav>
      </div>

      {banner}

      <div className="atom-app-body">
        <main className="atom-app-stage">
          <div className="atom-app-content" ref={stageRef}>
            {children}
          </div>
        </main>
        {composer ? <footer className="atom-app-composer">{composer}</footer> : null}
      </div>
    </div>
  );
}
