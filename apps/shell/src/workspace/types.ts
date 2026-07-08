export type WorkspaceKind = "personal" | "business" | "developer";

export interface Workspace {
  id: string;
  kind: WorkspaceKind;
  label: string;
  handle?: string;
  businessDomain?: string;
  createdAt: string;
}

export function workspaceStorageKey(baseKey: string, workspaceId: string): string {
  return `${baseKey}:${workspaceId}`;
}

export function isBusinessWorkspace(workspace: Workspace | null | undefined): boolean {
  return workspace?.kind === "business";
}

export function defaultPersonalWorkspace(label = "Personal"): Workspace {
  return {
    id: "personal",
    kind: "personal",
    label,
    createdAt: new Date().toISOString(),
  };
}
