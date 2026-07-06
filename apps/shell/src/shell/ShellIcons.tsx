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

const settingsCogSrc = `${import.meta.env.BASE_URL}icons/settings-cog.png`;

export function IconSettings(props: IconProps) {
  const className = props.className
    ? `${props.className} atom-icon-settings`
    : "atom-icon-settings";
  return (
    <img
      src={settingsCogSrc}
      className={className}
      width={18}
      height={18}
      alt=""
      aria-hidden={props.label ? undefined : true}
      aria-label={props.label}
      role={props.label ? "img" : undefined}
    />
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

export function IconAtomMark(props: IconProps) {
  return (
    <svg className={props.className} width={24} height={24} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="var(--shell-accent)" />
      <circle cx="12" cy="12" r="4" fill="var(--shell-sidebar-bg)" />
    </svg>
  );
}
