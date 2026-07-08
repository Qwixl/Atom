import type { LinkIntentKind, LinkIntentPayload } from "../chat/linkIntent.js";
import { LINK_INTENT_LABELS } from "../chat/linkIntent.js";

/** One hop on an owner discovery path (F7-2). */
export interface DiscoveryPathStep {
  id: string;
  url: string;
  title: string;
  intent: LinkIntentKind;
  at: number;
  parentStepId?: string;
}

/** Vault-scoped exploration branch — append-only steps. */
export interface DiscoveryPath {
  id: string;
  label: string;
  startedAt: number;
  steps: DiscoveryPathStep[];
  themes: string[];
}

const PATHS_STORAGE_KEY = "atom.discovery.paths.v1";
const ACTIVE_PATH_STORAGE_KEY = "atom.discovery.activePathId";
const MAX_PERSISTED_PATHS = 24;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function truncateLabel(text: string, max = 48): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function normalizeStep(raw: unknown): DiscoveryPathStep | null {
  if (!isRecord(raw)) return null;
  const url = typeof raw.url === "string" ? raw.url : "";
  const title = typeof raw.title === "string" ? raw.title : "";
  const intent = raw.intent;
  if (!url || !title || typeof intent !== "string") return null;
  if (intent !== "summarize" && intent !== "full" && intent !== "explore") return null;
  const at = typeof raw.at === "number" ? raw.at : Date.now();
  const id = typeof raw.id === "string" ? raw.id : newId("step");
  const parentStepId = typeof raw.parentStepId === "string" ? raw.parentStepId : undefined;
  return { id, url, title, intent: intent as LinkIntentKind, at, parentStepId };
}

function normalizePath(raw: unknown): DiscoveryPath | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : newId("path");
  const label = typeof raw.label === "string" ? raw.label : "Discovery";
  const startedAt = typeof raw.startedAt === "number" ? raw.startedAt : Date.now();
  const stepsRaw = Array.isArray(raw.steps) ? raw.steps : [];
  const steps = stepsRaw.map(normalizeStep).filter((step): step is DiscoveryPathStep => step !== null);
  const themes = Array.isArray(raw.themes)
    ? raw.themes.filter((theme): theme is string => typeof theme === "string")
    : [];
  return { id, label, startedAt, steps, themes };
}

export function loadDiscoveryPaths(): DiscoveryPath[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(PATHS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizePath).filter((path): path is DiscoveryPath => path !== null);
  } catch {
    return [];
  }
}

export function saveDiscoveryPaths(paths: readonly DiscoveryPath[]): void {
  if (typeof localStorage === "undefined") return;
  const trimmed = paths.slice(-MAX_PERSISTED_PATHS);
  localStorage.setItem(PATHS_STORAGE_KEY, JSON.stringify(trimmed));
}

export function loadActiveDiscoveryPathId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(ACTIVE_PATH_STORAGE_KEY);
}

export function saveActiveDiscoveryPathId(pathId: string | null): void {
  if (typeof sessionStorage === "undefined") return;
  if (!pathId) {
    sessionStorage.removeItem(ACTIVE_PATH_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(ACTIVE_PATH_STORAGE_KEY, pathId);
}

export function findDiscoveryPath(
  paths: readonly DiscoveryPath[],
  pathId: string | null | undefined,
): DiscoveryPath | null {
  if (!pathId) return null;
  return paths.find((path) => path.id === pathId) ?? null;
}

export function ensureActiveDiscoveryPath(
  paths: readonly DiscoveryPath[],
  activePathId: string | null,
  seedTitle: string,
): { paths: DiscoveryPath[]; path: DiscoveryPath } {
  const existing = findDiscoveryPath(paths, activePathId);
  if (existing) {
    return { paths: [...paths], path: existing };
  }
  const path: DiscoveryPath = {
    id: newId("path"),
    label: truncateLabel(seedTitle),
    startedAt: Date.now(),
    steps: [],
    themes: [],
  };
  return { paths: [...paths, path], path };
}

export interface AppendDiscoveryStepResult {
  paths: DiscoveryPath[];
  path: DiscoveryPath;
  step: DiscoveryPathStep;
}

/** Append a link-intent hop to the active path (creates path when needed). */
export function appendDiscoveryStep(
  paths: readonly DiscoveryPath[],
  activePathId: string | null,
  payload: Pick<LinkIntentPayload, "url" | "title" | "intent">,
): AppendDiscoveryStepResult {
  const ensured = ensureActiveDiscoveryPath(paths, activePathId, payload.title);
  const pathIndex = ensured.paths.findIndex((entry) => entry.id === ensured.path.id);
  const previous = ensured.path.steps[ensured.path.steps.length - 1];
  const step: DiscoveryPathStep = {
    id: newId("step"),
    url: payload.url,
    title: payload.title.trim() || payload.url,
    intent: payload.intent,
    at: Date.now(),
    parentStepId: previous?.id,
  };
  const updatedPath: DiscoveryPath = {
    ...ensured.path,
    label: ensured.path.steps.length === 0 ? truncateLabel(step.title) : ensured.path.label,
    steps: [...ensured.path.steps, step],
  };
  const nextPaths = [...ensured.paths];
  if (pathIndex >= 0) {
    nextPaths[pathIndex] = updatedPath;
  } else {
    nextPaths.push(updatedPath);
  }
  return { paths: nextPaths, path: updatedPath, step };
}

/** Clear the active path pointer without deleting stored history. */
export function clearActiveDiscoveryPathId(): void {
  saveActiveDiscoveryPathId(null);
}

/** Remove one path from persisted history (optional permanent dismiss). */
export function removeDiscoveryPath(
  paths: readonly DiscoveryPath[],
  pathId: string | null,
): DiscoveryPath[] {
  if (!pathId) return [...paths];
  return paths.filter((path) => path.id !== pathId);
}

/** @deprecated Use removeDiscoveryPath — kept for call sites that permanently drop a path. */
export function closeDiscoveryPath(
  paths: readonly DiscoveryPath[],
  activePathId: string | null,
): DiscoveryPath[] {
  return removeDiscoveryPath(paths, activePathId);
}

/** Truncate an active path to the selected hop (drops later steps). */
export function truncateDiscoveryPathToStep(
  paths: readonly DiscoveryPath[],
  pathId: string | null,
  stepId: string,
): AppendDiscoveryStepResult | null {
  const path = findDiscoveryPath(paths, pathId);
  if (!path) return null;
  const index = path.steps.findIndex((step) => step.id === stepId);
  if (index < 0) return null;
  const step = path.steps[index];
  if (!step) return null;
  const updatedPath: DiscoveryPath = {
    ...path,
    steps: path.steps.slice(0, index + 1),
  };
  const nextPaths = paths.map((entry) => (entry.id === path.id ? updatedPath : entry));
  return { paths: nextPaths, path: updatedPath, step };
}

export function enrichLinkIntentPayload(
  payload: LinkIntentPayload,
  path: DiscoveryPath,
  step: DiscoveryPathStep,
): LinkIntentPayload {
  return {
    ...payload,
    pathId: path.id,
    stepId: step.id,
    stepIndex: path.steps.length - 1,
  };
}

/** Agent-readable snapshot of the active discovery branch. */
export function formatDiscoveryPathForPrompt(path: DiscoveryPath | null | undefined): string {
  if (!path || path.steps.length === 0) return "";
  const lines = path.steps.map((step, index) => {
    const marker = index === path.steps.length - 1 ? " (current)" : "";
    return `${index + 1}. ${LINK_INTENT_LABELS[step.intent]}: ${step.title} — ${step.url}${marker}`;
  });
  return `Active discovery path "${path.label}" (${path.steps.length} step${path.steps.length === 1 ? "" : "s"}):
${lines.join("\n")}`;
}

/** Newest-first index of stored exploration branches (F7-2 history object). */
export function listDiscoveryHistory(paths: readonly DiscoveryPath[]): DiscoveryPath[] {
  return [...paths]
    .filter((path) => path.steps.length > 0)
    .sort((a, b) => {
      const aAt = a.steps[a.steps.length - 1]?.at ?? a.startedAt;
      const bAt = b.steps[b.steps.length - 1]?.at ?? b.startedAt;
      return bAt - aAt;
    });
}

export function lastActivityAt(path: DiscoveryPath): number {
  return path.steps[path.steps.length - 1]?.at ?? path.startedAt;
}
