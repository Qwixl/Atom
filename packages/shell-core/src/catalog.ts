import type { JsonObject } from "./types.js";
import type { ModulePricing } from "./registry/pricing.js";

/** Declaration of a single renderable component in the catalog. */
export interface ComponentSpec {
  /** Fully-qualified name, e.g. "core/text" or "finance/portfolio-chart". */
  name: string;
  /** Abstract type for fallback substitution, e.g. "chart/time-series". */
  semanticRole: string;
  /** Undefined for core primitives; module id for community modules. */
  moduleId?: string;
  /** Events this component may emit; undeclared events are dropped. */
  events?: string[];
  /** Hint compiled into the composing agent's context. */
  agentHint?: string;
}

/** Module manifest, per the v1 sketch. Capabilities are always empty in v1. */
export interface ModuleManifest {
  id: string;
  version: string;
  publisher: string;
  targets: string[];
  /** v1: URL to the iframe bundle entry (served statically by the host). */
  bundleUrl: string;
  /** sha256 digest of bundle bytes; verified on install when present. */
  bundleIntegrity?: string;
  /** URL to Sigstore bundle JSON; runtime DSSE digest match; CLI verifies at publish. */
  signatureUrl?: string;
  components: Array<{
    name: string;
    semanticRole: string;
    events?: Array<{ name: string }>;
    agentHint?: string;
  }>;
  capabilities: never[] | [];
  categories?: string[];
  /** Optional store listing price (M8). Omitted = free. */
  pricing?: ModulePricing;
}

export interface CatalogEntry {
  spec: ComponentSpec;
  /** Core primitives are trusted; modules go through the sandbox boundary. */
  origin: "core" | "module";
}

function parseReference(reference: string): { name: string; version?: string } {
  const at = reference.lastIndexOf("@");
  if (at > 0) {
    return { name: reference.slice(0, at), version: reference.slice(at + 1) };
  }
  return { name: reference };
}

/**
 * The shell's vocabulary: core primitives plus lazily-installed modules.
 * v1: core primitives plus modules installed via {@link ModuleRegistry} or
 * direct `installModule` (tests, embed hosts).
 */
export class Catalog {
  private entries = new Map<string, CatalogEntry>();
  private modules = new Map<string, ModuleManifest>();

  registerCore(spec: ComponentSpec): void {
    this.entries.set(spec.name, { spec, origin: "core" });
  }

  installModule(manifest: ModuleManifest): void {
    if (manifest.capabilities.length > 0) {
      throw new Error(
        `Module ${manifest.id} requests capabilities; v1 modules must be pure renderers.`,
      );
    }
    if (!manifest.bundleUrl?.trim()) {
      throw new Error(`Module ${manifest.id} must declare a bundleUrl.`);
    }
    this.modules.set(manifest.id, manifest);
    for (const component of manifest.components) {
      this.entries.set(component.name, {
        origin: "module",
        spec: {
          name: component.name,
          semanticRole: component.semanticRole,
          moduleId: manifest.id,
          events: component.events?.map((event) => event.name),
          agentHint: component.agentHint,
        },
      });
    }
  }

  uninstallModule(moduleId: string): void {
    this.modules.delete(moduleId);
    for (const [name, entry] of this.entries) {
      if (entry.spec.moduleId === moduleId) this.entries.delete(name);
    }
  }

  isModuleInstalled(moduleId: string): boolean {
    return this.modules.has(moduleId);
  }

  getModuleBundle(moduleId: string): string | undefined {
    return this.modules.get(moduleId)?.bundleUrl;
  }

  /** Resolve a composition reference like "finance/portfolio-chart@2". */
  lookup(reference: string): CatalogEntry | undefined {
    return this.entries.get(parseReference(reference).name);
  }

  /** Find a core primitive matching a semantic role, for fallback substitution. */
  findCoreBySemanticRole(semanticRole: string): CatalogEntry | undefined {
    for (const entry of this.entries.values()) {
      if (entry.origin === "core" && entry.spec.semanticRole === semanticRole) {
        return entry;
      }
    }
    return undefined;
  }

  /**
   * The catalog as agent context: how the composing agent learns the
   * vocabulary (the manifest's second audience).
   */
  toAgentContext(): JsonObject[] {
    return [...this.entries.values()].map((entry) => ({
      component: entry.spec.name,
      semanticRole: entry.spec.semanticRole,
      events: entry.spec.events ?? [],
      hint: entry.spec.agentHint ?? null,
    }));
  }

  list(): CatalogEntry[] {
    return [...this.entries.values()];
  }
}
