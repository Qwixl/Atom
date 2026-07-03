import type { ModuleManifest } from "../catalog.js";

export function validateModuleManifest(raw: unknown): ModuleManifest {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Manifest is not an object");
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== "string" || !m.id.trim()) throw new Error("manifest.id required");
  if (typeof m.version !== "string" || !m.version.trim()) throw new Error("manifest.version required");
  if (typeof m.publisher !== "string") throw new Error("manifest.publisher required");
  if (typeof m.bundleUrl !== "string" || !m.bundleUrl.trim()) {
    throw new Error("manifest.bundleUrl required");
  }
  if (!Array.isArray(m.targets)) throw new Error("manifest.targets required");
  if (!Array.isArray(m.components) || m.components.length === 0) {
    throw new Error("manifest.components required");
  }
  if (!Array.isArray(m.capabilities)) throw new Error("manifest.capabilities required");
  const capabilities = m.capabilities as unknown[];
  if (capabilities.length > 0) {
    throw new Error(`Module ${m.id} requests capabilities; v1 modules must be pure renderers.`);
  }
  if (m.bundleIntegrity !== undefined && typeof m.bundleIntegrity !== "string") {
    throw new Error("manifest.bundleIntegrity must be a string when present");
  }
  if (m.signatureUrl !== undefined && typeof m.signatureUrl !== "string") {
    throw new Error("manifest.signatureUrl must be a string when present");
  }
  return raw as ModuleManifest;
}
