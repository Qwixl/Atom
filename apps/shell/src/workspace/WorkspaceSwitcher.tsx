import type { Workspace } from "./types.js";

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  disabled,
  onSwitch,
  onCreateBusiness,
}: {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  disabled?: boolean;
  onSwitch: (workspaceId: string) => void | Promise<void>;
  onCreateBusiness?: () => void | Promise<void>;
}) {
  const active = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];

  return (
    <div className="workspace-switcher">
      <label className="workspace-switcher-label" htmlFor="workspace-select">
        Acting as
      </label>
      <select
        id="workspace-select"
        className="workspace-switcher-select"
        value={active?.id ?? ""}
        disabled={disabled}
        onChange={(event) => onSwitch(event.target.value)}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.label} ({workspace.kind})
          </option>
        ))}
      </select>
      {onCreateBusiness ? (
        <button type="button" className="workspace-switcher-add" disabled={disabled} onClick={onCreateBusiness}>
          Add business
        </button>
      ) : null}
    </div>
  );
}
