import { useEffect, useRef } from "react";
import { ThemeToggle } from "../theme/ThemeToggle.js";
import type { ShellNavPanel } from "./ShellSidebar.js";
import {
  IconChat,
  IconDiscover,
  IconLog,
  IconMessages,
  IconProfile,
  IconRooms,
  IconSettings,
} from "./ShellIcons.js";

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
  onOpenSettings: () => void;
  settingsLabel?: string;
  badges?: Partial<Record<ShellNavPanel, { count: number; tone?: "default" | "warn" }>>;
  status?: React.ReactNode;
  banner?: React.ReactNode;
  headerActions?: React.ReactNode;
  composer?: React.ReactNode;
  lockedSections?: ShellNavPanel[];
  showDemoTag?: boolean;
  variant?: "default" | "demo";
  children: React.ReactNode;
};

const NAV: Omit<NavItem, "badge" | "locked">[] = [
  { id: "none", label: "Chat", icon: IconChat },
  { id: "comms", label: "Messages", icon: IconMessages },
  { id: "discover", label: "Discover", icon: IconDiscover },
  { id: "rooms", label: "Rooms", icon: IconRooms },
  { id: "profile", label: "Profile", icon: IconProfile },
  { id: "log", label: "Log", icon: IconLog },
];

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

export function AtomShell({
  section,
  onNavigate,
  onOpenSettings,
  settingsLabel = "Settings",
  badges = {},
  status,
  banner,
  headerActions,
  composer,
  lockedSections = [],
  showDemoTag = false,
  variant = "default",
  children,
}: AtomShellProps) {
  const menuDialogRef = useRef<HTMLDialogElement>(null);
  const locked = new Set(lockedSections);

  const items: NavItem[] = NAV.map((entry) => ({
    ...entry,
    badge: badges[entry.id]?.count,
    badgeTone: badges[entry.id]?.tone,
    locked: locked.has(entry.id),
  }));

  function selectSection(id: ShellNavPanel) {
    if (locked.has(id)) return;
    onNavigate(id);
    menuDialogRef.current?.close();
  }

  useEffect(() => {
    const dialog = menuDialogRef.current;
    if (!dialog) return;
    const onClose = () => {};
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  return (
    <div className={`atom-app${variant === "demo" ? " atom-app--demo" : ""}`}>
      <header className="atom-app-header site-header">
        <div className="atom-app-header-inner">
        <a className="site-brand" href="/">
          <span className="site-brand-mark" aria-hidden="true">
            A
          </span>
          Atom
          {showDemoTag ? <span className="demo-tag">Demo</span> : null}
        </a>

        <nav className="atom-app-tabs" aria-label="Sections">
          {items.map((item) => (
            <NavButton key={item.id} item={item} active={section === item.id} onSelect={selectSection} />
          ))}
        </nav>

        <div className="atom-app-header-end">
          {headerActions}
          {status}
          <ThemeToggle className="btn btn-ghost atom-theme-toggle" />
          <button
            type="button"
            className="btn btn-ghost atom-app-settings panel-btn-icon"
            aria-label={settingsLabel}
            title={settingsLabel}
            onClick={onOpenSettings}
          >
            <IconSettings className="atom-nav-icon" />
          </button>
          <button
            type="button"
            className="btn btn-ghost atom-app-menu-trigger"
            aria-haspopup="dialog"
            onClick={() => menuDialogRef.current?.showModal()}
          >
            Menu
          </button>
        </div>
        </div>
      </header>

      {banner}

      <div className="atom-app-body">
        <main className="atom-app-stage">
          <div className="atom-app-content">{children}</div>
        </main>
        {composer ? <footer className="atom-app-composer">{composer}</footer> : null}
      </div>

      <nav className="atom-app-dock" aria-label="Quick navigation">
        {items.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={`atom-dock-item${section === item.id ? " is-active" : ""}${item.locked ? " is-locked" : ""}`}
              aria-current={section === item.id ? "page" : undefined}
              disabled={item.locked}
              onClick={() => selectSection(item.id)}
            >
              <Icon className="atom-nav-icon" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <dialog ref={menuDialogRef} className="atom-menu-dialog">
        <form method="dialog" className="atom-menu-dialog-head">
          <strong>Sections</strong>
          <button type="submit" className="btn btn-ghost">
            Close
          </button>
        </form>
        <nav className="atom-menu-dialog-nav">
          {items.map((item) => (
            <NavButton key={item.id} item={item} active={section === item.id} onSelect={selectSection} />
          ))}
        </nav>
      </dialog>
    </div>
  );
}
