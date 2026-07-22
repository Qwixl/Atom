import { useEffect, useRef } from "react";
import { AtomIdent } from "../brand/AtomIdent.js";
import {
  IconBoard,
  IconChat,
  IconLog,
  IconMessages,
  IconProfile,
  IconRooms,
  IconSettings,
} from "./ShellIcons.js";

export type ShellNavPanel =
  | "none"
  | "log"
  | "profile"
  | "comms"
  | "discover"
  | "rooms"
  | "board";

type NavItem = {
  id: ShellNavPanel;
  label: string;
  icon: typeof IconChat;
  badge?: number;
  badgeTone?: "default" | "warn";
};

type ShellSidebarProps = {
  panel: ShellNavPanel;
  onNavigate: (panel: ShellNavPanel) => void;
  onOpenSettings: () => void;
  commsCount: number;
  profileBadge: { count: number; tone: "default" | "warn" } | null;
  logCount: number;
  mobileOpen: boolean;
  onMobileClose: () => void;
  boardAvailable?: boolean;
};

function NavList({
  panel,
  primaryNav,
  onSelect,
  onOpenSettings,
  onMobileClose,
}: {
  panel: ShellNavPanel;
  primaryNav: NavItem[];
  onSelect: (id: ShellNavPanel) => void;
  onOpenSettings: () => void;
  onMobileClose: () => void;
}) {
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
                  className={`shell-sidebar-nav-item${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
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
      </div>
    </>
  );
}

export function ShellSidebar({
  panel,
  onNavigate,
  onOpenSettings,
  commsCount,
  profileBadge,
  logCount,
  mobileOpen,
  onMobileClose,
  boardAvailable = false,
}: ShellSidebarProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const primaryNav: NavItem[] = [
    { id: "none", label: "Chat", icon: IconChat },
    {
      id: "comms",
      label: "Messages",
      icon: IconMessages,
      badge: commsCount > 0 ? commsCount : undefined,
    },
    { id: "rooms", label: "Rooms", icon: IconRooms },
    ...(boardAvailable ? [{ id: "board" as const, label: "Board", icon: IconBoard }] : []),
    {
      id: "profile",
      label: "Profile",
      icon: IconProfile,
      badge: profileBadge?.count,
      badgeTone: profileBadge?.tone,
    },
    {
      id: "log",
      label: "Attestation log",
      icon: IconLog,
      badge: logCount > 0 ? logCount : undefined,
    },
  ];

  function selectPanel(next: ShellNavPanel) {
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
      onMobileClose={onMobileClose}
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
