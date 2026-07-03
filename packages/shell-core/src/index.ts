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

export type { AgentSession, AgentOutput, AgentOutputListener, DataRequest } from "./session.js";

export {
  upsertFeedSurface,
  appendAgentText,
  appendUserMessage,
  clearFeed,
} from "./conversation.js";
export type { FeedItem } from "./conversation.js";

export { normalizeDataRequest } from "./dataRequest.js";

export { buildDataRequestChrome } from "./chrome.js";
export type { PendingChrome } from "./chrome.js";

export { ConversationRuntime } from "./ConversationRuntime.js";
export type { ConversationSnapshot, ConversationRuntimeOptions } from "./ConversationRuntime.js";



export { registerCorePrimitives, CORE_PRIMITIVES } from "./core-primitives.js";



export { validateComposition, validateConsequentialAction } from "./validate.js";

export type { ValidationResult } from "./validate.js";

export {
  parseAgentProtocolMessage,
  parseCompositionValue,
  parseConsequentialPayload,
  parseDataRequestPayload,
} from "./agentOutput.js";
export type { AgentWireResult, AgentWireReject } from "./agentOutput.js";

export {
  createJsonPersistence,
  createAttestationPersistence,
  loadJsonFromStorage,
  saveJsonToStorage,
  loadStringFromStorage,
  saveStringToStorage,
  loadBooleanFromStorage,
} from "./persistence.js";
export type { JsonPersistence, JsonPersistenceOptions } from "./persistence.js";

export {

  ModuleRegistry,

  collectComponentReferences,

  versionMatches,

  computeModuleIntegrity,

  validateModuleManifest,

  formatIntegrity,

  parseIntegrity,

  sha256Hex,

  integrityMatches,

  LocalStorageRegistryCache,

  manifestCacheKey,

  assertTrustPolicy,

  isRevoked,

  verifyManifestSignature,

  isSigstoreBundleShape,

  bundleStatementReferencesDigest,

} from "./registry.js";

export type {

  RegistryIndex,

  RegistryModuleEntry,

  ModuleRegistryOptions,

  RegistryTrustPolicy,

  RegistryRevocation,

  RegistryRevocations,

  RegistryCacheSnapshot,

  RegistryCacheStore,

} from "./registry.js";

export {
  validateHttpsUrl,
  resolveModuleBundleOrigin,
  isCrossOriginModuleBundle,
} from "./security/url.js";

