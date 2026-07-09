import { loadStringFromStorage, saveStringToStorage } from "@qwixl/shell-core";
import { defaultPersonalWorkspace, type Workspace, type WorkspaceKind } from "./types.js";

const REGISTRY_KEY = "atom-workspaces";
const ACTIVE_KEY = "atom-active-workspace-id";

function loadRegistry(): Workspace[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(REGISTRY_KEY) : null;
    if (!raw) return [defaultPersonalWorkspace()];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return [defaultPersonalWorkspace()];
    return parsed.filter(
      (item): item is Workspace =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as Workspace).id === "string" &&
        typeof (item as Workspace).kind === "string" &&
        typeof (item as Workspace).label === "string",
    );
  } catch {
    return [defaultPersonalWorkspace()];
  }
}

function saveRegistry(workspaces: Workspace[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(workspaces));
  } catch {
    // Best-effort.
  }
}

export function listWorkspaces(): Workspace[] {
  const workspaces = loadRegistry();
  if (!workspaces.some((w) => w.kind === "personal")) {
    return [defaultPersonalWorkspace(), ...workspaces];
  }
  return workspaces;
}

export function loadActiveWorkspaceId(): string {
  return loadStringFromStorage(ACTIVE_KEY)?.trim() || "personal";
}

export function saveActiveWorkspaceId(workspaceId: string): void {
  saveStringToStorage(ACTIVE_KEY, workspaceId);
}

export function getActiveWorkspace(): Workspace {
  const id = loadActiveWorkspaceId();
  return listWorkspaces().find((w) => w.id === id) ?? defaultPersonalWorkspace();
}

export function setActiveWorkspace(workspaceId: string): Workspace | null {
  const workspace = listWorkspaces().find((w) => w.id === workspaceId);
  if (!workspace) return null;
  saveActiveWorkspaceId(workspace.id);
  return workspace;
}

export function createWorkspace(input: {
  kind: WorkspaceKind;
  label: string;
  handle?: string;
  businessDomain?: string;
  id?: string;
}): Workspace {
  const workspaces = listWorkspaces();
  const workspace: Workspace = {
    id: input.id?.trim() || crypto.randomUUID(),
    kind: input.kind,
    label: input.label.trim() || input.kind,
    handle: input.handle?.trim() || undefined,
    businessDomain: input.businessDomain?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  workspaces.push(workspace);
  saveRegistry(workspaces);
  return workspace;
}

/** Insert or replace a workspace by id (hosted sync). */
export function upsertWorkspace(workspace: Workspace): Workspace {
  const workspaces = listWorkspaces().filter((w) => w.id !== workspace.id);
  workspaces.push(workspace);
  saveRegistry(workspaces);
  return workspace;
}

export function ensureWorkspaceFromAccountType(accountType: "user" | "business" | "developer" | undefined): void {
  const workspaces = listWorkspaces();
  if (accountType === "business" && !workspaces.some((w) => w.kind === "business")) {
    workspaces.push({
      id: crypto.randomUUID(),
      kind: "business",
      label: "Business",
      createdAt: new Date().toISOString(),
    });
    saveRegistry(workspaces);
  }
  if (accountType === "developer" && !workspaces.some((w) => w.kind === "developer")) {
    workspaces.push({
      id: crypto.randomUUID(),
      kind: "developer",
      label: "Developer",
      createdAt: new Date().toISOString(),
    });
    saveRegistry(workspaces);
  }
}
