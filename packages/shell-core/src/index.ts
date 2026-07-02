export type {
  JsonValue,
  JsonObject,
  CompositionNode,
  Composition,
  UiEvent,
  ConsequentialAction,
} from "./types.js";

export { Catalog } from "./catalog.js";
export type { ComponentSpec, ModuleManifest, CatalogEntry } from "./catalog.js";

export { resolveComposition } from "./resolver.js";
export type { ResolvedNode, ResolvedSurface } from "./resolver.js";

export { AttestationLog } from "./attestation.js";
export type { AttestationEntry } from "./attestation.js";

export { SessionEmitter } from "./session.js";
export type { AgentSession, AgentOutput, AgentOutputListener } from "./session.js";

export { registerCorePrimitives, CORE_PRIMITIVES } from "./core-primitives.js";

export { validateComposition, validateConsequentialAction } from "./validate.js";
export type { ValidationResult } from "./validate.js";
