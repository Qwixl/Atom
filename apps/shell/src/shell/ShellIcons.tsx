import type { ReactNode } from "react";

type IconProps = { className?: string; label?: string };

function IconBase({ className, label, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      {children}
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </IconBase>
  );
}

export function IconInbox(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 6h16v12H4z" />
      <path d="M4 10h4l2 3h4l2-3h4" />
    </IconBase>
  );
}

export function IconTasks(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 11l2 2 5-5" />
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </IconBase>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M4 11h16" />
    </IconBase>
  );
}

export function IconMemory(props: IconProps) {
  return (
    <IconBase {...props}>
      <ellipse cx="12" cy="12" rx="8" ry="5" />
      <path d="M6 12v3c0 2.2 2.7 4 6 4s6-1.8 6-4v-3" />
    </IconBase>
  );
}

export function IconTools(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4z" />
    </IconBase>
  );
}

export function IconAgents(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 20c.8-3 3.5-5 6-5s5.2 2 6 5M14 20c.5-2 2-3.5 4-3.5" />
    </IconBase>
  );
}

export function IconMarketplace(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 8h16l-1.5 11H5.5z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </IconBase>
  );
}

export function IconChat(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </IconBase>
  );
}

export function IconMessages(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 6h16M4 12h10M4 18h14" />
    </IconBase>
  );
}

export function IconDiscover(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </IconBase>
  );
}

export function IconRooms(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 9h18v10H3z" />
      <path d="M7 9V5h10v4" />
    </IconBase>
  );
}

export function IconProfile(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-4 6.5-4 8-4s6.5 0 8 4" />
    </IconBase>
  );
}

export function IconLog(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </IconBase>
  );
}

/** Left-arrow exit / sign-out affordance for the mobile menu. */
export function IconExit(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M15 12H3" />
      <path d="m7 8-4 4 4 4" />
      <path d="M21 4v16" />
    </IconBase>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </IconBase>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </IconBase>
  );
}

export function IconLeave(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </IconBase>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6M12 7h.01" />
    </IconBase>
  );
}

export function IconClose(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </IconBase>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </IconBase>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m9 6 6 6-6 6" />
    </IconBase>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 9 6 6 6-6" />
    </IconBase>
  );
}

/** Space-invader silhouette for the Games chrome control. */
export function IconGames(props: IconProps) {
  return (
    <svg
      className={props.className}
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden={props.label ? undefined : true}
      aria-label={props.label}
      role={props.label ? "img" : undefined}
    >
      {/* Scaled to fill the viewBox — pixel art otherwise reads smaller than stroke icons. */}
      <g transform="translate(12 12) scale(1.22) translate(-12 -12)">
        <path d="M9 3h2v2H9zm4 0h2v2h-2zM7 5h2v2H7zm8 0h2v2h-2zM5 7h14v2H5zm0 2h2v2H5zm4 0h6v2H9zm6 0h2v2h-2zM3 11h2v4H3zm4 0h2v2H7zm8 0h2v2h-2zm4 0h2v4h-2zM7 13h2v2H7zm8 0h2v2h-2zM5 15h2v2H5zm4 0h2v2H9zm4 0h2v2h-2zm4 0h2v2h-2zM7 17h2v2H7zm8 0h2v2h-2z" />
      </g>
    </svg>
  );
}

export function IconAtomMark(props: IconProps) {
  return (
    <svg className={props.className} width={24} height={24} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="var(--shell-accent)" />
      <circle cx="12" cy="12" r="4" fill="var(--shell-sidebar-bg)" />
    </svg>
  );
}

/** Presentation board tray — grid of regions. */
export function IconBoard(props: IconProps) {
  return (
    <svg
      className={props.className}
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden={props.label ? undefined : true}
      aria-label={props.label}
      role={props.label ? "img" : undefined}
    >
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}
