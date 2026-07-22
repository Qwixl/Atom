import { useCallback, useId, useRef, useState } from "react";
import { AtomIdent } from "../brand/AtomIdent.js";
import { ShellSidebar, type ShellNavPanel } from "./ShellSidebar.js";
import { GamesMenu, type GamesMenuItem } from "./GamesMenu.js";
import {
  IconBoard,
  IconChat,
  IconChevronDown,
  IconChevronRight,
  IconDiscover,
  IconExit,
  IconGames,
  IconMenu,
  IconMessages,
  IconProfile,
  IconLog,
  IconRooms,
  IconSettings,
} from "./ShellIcons.js";

export type SettingsOpenTarget = "profile" | "log" | "modules" | "default";

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
  ownerName?: string;
  ownerHandle?: string;
  badges?: Partial<Record<ShellNavPanel, { count: number; tone?: "default" | "warn" }>>;
  status?: React.ReactNode;
  banner?: React.ReactNode;
  headerActions?: React.ReactNode;
  /** Shell-arbitrated games available in the trusted catalog. */
  games?: readonly GamesMenuItem[];
  onStartGame?: (moduleId: string) => void;
  composer?: React.ReactNode;
  lockedSections?: ShellNavPanel[];
  /** When true, show Board nav (paid presentation-board module entitled). */
  boardAvailable?: boolean;
  showDemoTag?: boolean;
  variant?: "default" | "demo";
  children: React.ReactNode;
};

/** Legacy mobile popover sections (chat, discover, rooms) plus overflow. */
const MOBILE_OVERFLOW_NAV: Omit<NavItem, "badge" | "locked">[] = [
  { id: "none", label: "Chat", icon: IconChat },
  { id: "discover", label: "Discover", icon: IconDiscover },
  { id: "rooms", label: "Rooms", icon: IconRooms },
];

const BOARD_NAV: Omit<NavItem, "badge" | "locked"> = {
  id: "board",
  label: "Board",
  icon: IconBoard,
};

type PopoverElement = HTMLElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
  togglePopover?: () => void;
};

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
  ownerName,
  ownerHandle,
  badges = {},
  status,
  banner,
  headerActions,
  games = [],
  onStartGame,
  composer,
  lockedSections = [],
  boardAvailable = false,
  showDemoTag = false,
  variant = "default",
  children,
}: AtomShellProps) {
  const locked = new Set(lockedSections);
  const overflowNav = boardAvailable
    ? [...MOBILE_OVERFLOW_NAV, BOARD_NAV]
    : MOBILE_OVERFLOW_NAV;
  const stageRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<PopoverElement | null>(null);
  const popoverId = useId().replace(/:/g, "");
  const navPopoverId = `atom-nav-menu-${popoverId}`;
  const [gamesOpen, setGamesOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const mobileOverflowItems = withBadges(overflowNav, badges, locked);

  const setPopoverNode = useCallback((node: HTMLDivElement | null) => {
    popoverRef.current = node;
    if (node && !node.hasAttribute("popover")) {
      node.setAttribute("popover", "auto");
    }
  }, []);

  function toggleNavMenu() {
    if (window.matchMedia("(min-width: 960px)").matches) return;
    setSidebarOpen((open) => !open);
  }

  function hideNavMenu() {
    setSidebarOpen(false);
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

  const menuBadgeTotal = mobileOverflowItems.reduce((sum, item) => sum + (item.badge ?? 0), 0);

  return (
    <div className={`atom-app${variant === "demo" ? " atom-app--demo" : ""}`}>
      <ShellSidebar
        panel={section}
        onNavigate={selectSection}
        onOpenSettings={() => openSettings("default")}
        onOpenAccount={() => {
          hideNavMenu();
          onOpenAccount();
        }}
        ownerName={ownerName}
        ownerHandle={ownerHandle}
        commsCount={badges.comms?.count ?? 0}
        profileBadge={badges.profile ?? null}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        boardAvailable={boardAvailable}
        lockedSections={lockedSections}
      />

      <div className="atom-app-shell-main">
        <header className="atom-app-header site-header atom-app-header--mobile">
          <div className="atom-app-header-inner">
            <button
              type="button"
              className="atom-app-menu-trigger"
              aria-label="Open menu"
              title="Menu"
              onClick={toggleNavMenu}
            >
              <IconMenu className="atom-menu-lines" />
              {menuBadgeTotal > 0 ? (
                <span className="atom-nav-badge atom-menu-trigger-badge" aria-hidden="true">
                  {menuBadgeTotal > 9 ? "9+" : menuBadgeTotal}
                </span>
              ) : null}
            </button>

            <a className="site-brand atom-brand-link" href="/" aria-label="Atom home">
              <AtomIdent className="atom-brand-ident" />
              <span className="atom-brand-name">Atom</span>
              {showDemoTag ? <span className="demo-tag">Demo</span> : null}
            </a>

            <div className="atom-app-header-end">
              {headerActions}
              <button
                type="button"
                className="atom-app-account panel-btn-icon"
                aria-label="Account"
                title="Account"
                onClick={() => {
                  hideNavMenu();
                  onOpenAccount();
                }}
              >
                <IconProfile className="atom-nav-icon" />
              </button>
            </div>
          </div>
        </header>

        <div className="atom-app-toolbar atom-app-toolbar--desktop">
          <div className="atom-app-toolbar-start">{status}</div>
          <div className="atom-app-toolbar-end">
            {headerActions}
            {onStartGame ? (
              <GamesMenu games={games} onSelect={onStartGame} className="atom-games-menu--toolbar" />
            ) : null}
            <button
              type="button"
              className="atom-app-settings panel-btn-icon"
              aria-label={settingsLabel}
              title={settingsLabel}
              onClick={() => openSettings("default")}
            >
              <IconSettings className="atom-nav-icon" />
            </button>
            {onLogout ? (
              <button
                type="button"
                className="atom-app-logout panel-btn-icon"
                aria-label="Exit"
                title="Exit"
                onClick={() => {
                  hideNavMenu();
                  onLogout();
                }}
              >
                <IconExit className="atom-nav-icon" />
              </button>
            ) : null}
          </div>
        </div>

        <div id={navPopoverId} ref={setPopoverNode} className="atom-nav-popover">
          <nav className="atom-nav-popover-nav" aria-label="More sections">
            {mobileOverflowItems.map((item) => {
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
            <button
              type="button"
              className="atom-nav-popover-item"
              onClick={() => openSettings("profile")}
            >
              <IconProfile className="atom-nav-icon" />
              <span>Profile</span>
              {badges.profile?.count ? (
                <span
                  className={`atom-nav-badge${badges.profile.tone === "warn" ? " atom-nav-badge--warn" : ""}`}
                >
                  {badges.profile.count}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="atom-nav-popover-item"
              onClick={() => openSettings("log")}
            >
              <IconLog className="atom-nav-icon" />
              <span>Log</span>
              {badges.log?.count ? (
                <span className="atom-nav-badge">{badges.log.count}</span>
              ) : null}
            </button>
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
    </div>
  );
}
