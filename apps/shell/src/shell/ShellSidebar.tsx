import { useEffect, useRef } from "react";
import { AtomIdent } from "../brand/AtomIdent.js";
import {
  IconAgents,
  IconBoard,
  IconCalendar,
  IconChat,
  IconDiscover,
  IconHome,
  IconInbox,
  IconMarketplace,
  IconMemory,
  IconProfile,
  IconRooms,
  IconSettings,
  IconTasks,
  IconTools,
} from "./ShellIcons.js";

export type ShellNavPanel =
  | "home"
  | "none"
  | "comms"
  | "tasks"
  | "calendar"
  | "memory"
  | "tools"
  | "agents"
  | "marketplace"
  | "discover"
  | "rooms"
  | "board"
  | "log"
  | "profile";

type NavItem = {
  id: ShellNavPanel;
  label: string;
  icon: typeof IconHome;
  badge?: number;
  badgeTone?: "default" | "warn";
  locked?: boolean;
};

type ShellSidebarProps = {
  panel: ShellNavPanel;
  onNavigate: (panel: ShellNavPanel) => void;
  onOpenSettings: () => void;
  onOpenAccount: () => void;
  ownerName?: string;
  ownerHandle?: string;
  commsCount: number;
  profileBadge: { count: number; tone?: "default" | "warn" } | null;
  mobileOpen: boolean;
  onMobileClose: () => void;
  boardAvailable?: boolean;
  lockedSections?: ShellNavPanel[];
};

function NavList({
  panel,
  primaryNav,
  onSelect,
  onOpenSettings,
  onOpenAccount,
  onMobileClose,
  ownerName,
  ownerHandle,
}: {
  panel: ShellNavPanel;
  primaryNav: NavItem[];
  onSelect: (id: ShellNavPanel) => void;
  onOpenSettings: () => void;
  onOpenAccount: () => void;
  onMobileClose: () => void;
  ownerName?: string;
  ownerHandle?: string;
}) {
  const displayName = ownerName?.trim() || "Owner";
  const displayHandle = ownerHandle?.trim() || "@owner";

  return (
    <>
      <div className="shell-sidebar-brand">
        <a className="shell-sidebar-brand-link" href="/" aria-label="Atom home">
          <AtomIdent className="shell-sidebar-brand-ident" />
          <span className="shell-sidebar-brand-name">Atom</span>
        </a>
      </div>

      <nav className="shell-sidebar-nav" aria-label="Sections">
        <ul className="shell-sidebar-nav-list">
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const active = panel === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`shell-sidebar-nav-item${active ? " is-active" : ""}${item.locked ? " is-locked" : ""}`}
                  aria-current={active ? "page" : undefined}
                  disabled={item.locked}
                  title={item.locked ? "Not available in demo" : undefined}
                  onClick={() => onSelect(item.id)}
                >
                  <Icon className="shell-sidebar-nav-icon" />
                  <span className="shell-sidebar-nav-label">{item.label}</span>
                  {item.badge ? (
                    <span
                      className={`shell-sidebar-badge${
                        item.badgeTone === "warn" ? " shell-sidebar-badge-warn" : ""
                      }`}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shell-sidebar-footer">
        <button
          type="button"
          className="shell-sidebar-footer-item"
          onClick={() => {
            onOpenSettings();
            onMobileClose();
          }}
        >
          <IconSettings className="shell-sidebar-nav-icon" />
          <span>Settings</span>
        </button>

        <button
          type="button"
          className="shell-sidebar-owner"
          onClick={() => {
            onOpenAccount();
            onMobileClose();
          }}
        >
          <span className="shell-sidebar-owner-avatar" aria-hidden="true">
            <IconProfile className="shell-sidebar-nav-icon" />
          </span>
          <span className="shell-sidebar-owner-text">
            <span className="shell-sidebar-owner-name">{displayName}</span>
            <span className="shell-sidebar-owner-handle">{displayHandle}</span>
          </span>
        </button>
      </div>
    </>
  );
}

export function ShellSidebar({
  panel,
  onNavigate,
  onOpenSettings,
  onOpenAccount,
  ownerName,
  ownerHandle,
  commsCount,
  profileBadge,
  mobileOpen,
  onMobileClose,
  boardAvailable = false,
  lockedSections = [],
}: ShellSidebarProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const locked = new Set(lockedSections);

  const primaryNav: NavItem[] = [
    { id: "home", label: "Home", icon: IconHome },
    { id: "none", label: "Chat", icon: IconChat },
    {
      id: "comms",
      label: "Inbox",
      icon: IconInbox,
      badge: commsCount > 0 ? commsCount : undefined,
    },
    { id: "tasks", label: "Tasks", icon: IconTasks, locked: locked.has("tasks") },
    { id: "calendar", label: "Calendar", icon: IconCalendar, locked: locked.has("calendar") },
    {
      id: "memory",
      label: "Memory",
      icon: IconMemory,
      badge: profileBadge?.count,
      badgeTone: profileBadge?.tone,
      locked: locked.has("memory"),
    },
    { id: "tools", label: "Tools", icon: IconTools, locked: locked.has("tools") },
    { id: "agents", label: "Agents", icon: IconAgents, locked: locked.has("agents") },
    { id: "discover", label: "Discover", icon: IconDiscover, locked: locked.has("discover") },
    { id: "rooms", label: "Rooms", icon: IconRooms, locked: locked.has("rooms") },
    {
      id: "marketplace",
      label: "Marketplace",
      icon: IconMarketplace,
      locked: locked.has("marketplace"),
    },
    ...(boardAvailable
      ? [{ id: "board" as const, label: "Board", icon: IconBoard, locked: locked.has("board") }]
      : []),
  ];

  function selectPanel(next: ShellNavPanel) {
    if (locked.has(next)) return;
    onNavigate(next);
    onMobileClose();
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (mobileOpen && !dialog.open) {
      dialog.showModal();
    } else if (!mobileOpen && dialog.open) {
      dialog.close();
    }
  }, [mobileOpen]);

  const nav = (
    <NavList
      panel={panel}
      primaryNav={primaryNav}
      onSelect={selectPanel}
      onOpenSettings={onOpenSettings}
      onOpenAccount={onOpenAccount}
      onMobileClose={onMobileClose}
      ownerName={ownerName}
      ownerHandle={ownerHandle}
    />
  );

  return (
    <>
      <aside className="shell-sidebar shell-sidebar--desktop" aria-label="Primary navigation">
        <div className="shell-sidebar-inner">{nav}</div>
      </aside>

      <dialog
        ref={dialogRef}
        className="shell-nav-dialog"
        aria-label="Navigation menu"
        onClose={onMobileClose}
        onCancel={onMobileClose}
      >
        <div className="shell-nav-dialog-inner">{nav}</div>
        <form method="dialog">
          <button type="submit" className="shell-nav-dialog-close" aria-label="Close menu">
            Close
          </button>
        </form>
      </dialog>
    </>
  );
}
