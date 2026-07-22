import type { ReactNode } from "react";

import { PanelSectionHeader } from "./PanelChrome.js";

type PlaceholderPanelProps = {
  title: string;
  description: string;
  eyebrow?: string;
  children?: ReactNode;
  actions?: ReactNode;
};

export function PlaceholderPanel({
  title,
  description,
  eyebrow,
  children,
  actions,
}: PlaceholderPanelProps) {
  return (
    <div className="shell-panel-view shell-panel-view--inset shell-placeholder-panel">
      <div className="shell-placeholder-panel-inner">
        <PanelSectionHeader eyebrow={eyebrow} title={title} subtitle={description} />
        {actions ? <div className="shell-placeholder-actions">{actions}</div> : null}
        {children}
      </div>
    </div>
  );
}
