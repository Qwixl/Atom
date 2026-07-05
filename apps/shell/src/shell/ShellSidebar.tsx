import {
  IconAtomMark,
  IconChat,
  IconDiscover,
  IconLog,
  IconMessages,
  IconProfile,
  IconRooms,
  IconSettings,
} from "./ShellIcons.js";

export type ShellNavPanel = "none" | "log" | "profile" | "comms" | "discover" | "rooms";

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
};

export function ShellSidebar({
  panel,
  onNavigate,
  onOpenSettings,
  commsCount,
  profileBadge,
  logCount,
  mobileOpen,
  onMobileClose,
}: ShellSidebarProps) {
  const primaryNav: NavItem[] = [
    { id: "none", label: "Chat", icon: IconChat },
    {
      id: "comms",
      label: "Messages",
      icon: IconMessages,
      badge: commsCount > 0 ? commsCount : undefined,
    },
    { id: "discover", label: "Discover", icon: IconDiscover },
    { id: "rooms", label: "Rooms", icon: IconRooms },
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

  return (
    <>
      <div
        className={`shell-sidebar-backdrop${mobileOpen ? " is-open" : ""}`}
        onClick={onMobileClose}
        aria-hidden="true"
      />
      <aside
        className={`shell-sidebar${mobileOpen ? " is-open" : ""}`}
        aria-label="Primary navigation"
      >
        <div className="shell-sidebar-inner">
          <div className="shell-sidebar-brand">
            <IconAtomMark className="shell-sidebar-brand-mark" />
            <span className="shell-sidebar-brand-name">Atom</span>
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
                      onClick={() => selectPanel(item.id)}
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
        </div>
      </aside>
    </>
  );
}
