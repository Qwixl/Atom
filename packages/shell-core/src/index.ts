export type {

  JsonValue,

  JsonObject,

  CompositionNode,

  Composition,

  UiEvent,

  ConsequentialAction,

} from "./types.js";



export { Catalog } from "./catalog.js";

export type { ComponentSpec, ModuleManifest, ModuleConnectorSpec, CatalogEntry } from "./catalog.js";



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
  BRIEFING_SURFACE_ID,
  clearFeed,
  findActiveFeedSurface,
  isBriefingSurface,
} from "./conversation.js";
export type { FeedItem, ActiveFeedSurface } from "./conversation.js";

export { normalizeDataRequest } from "./dataRequest.js";

export { buildDataRequestChrome } from "./chrome.js";
export type { PendingChrome } from "./chrome.js";

export { ConversationRuntime } from "./ConversationRuntime.js";
export type { ConversationSnapshot, ConversationRuntimeOptions, TurnCompleteInfo } from "./ConversationRuntime.js";

export { getGameEngine, registerGameEngine, listGameModuleIds } from "./games/registry.js";
export { TictactoeEngine } from "./games/tictactoe.js";
export {
  BattleshipsEngine,
  BATTLESHIPS_LEVEL_1,
  canPartitionIntoShips,
  isStraightShip,
  randomFleetPlacement,
} from "./games/battleships.js";
export { GameOrchestrator, GAME_MOVE_FALLBACK_TEXT } from "./games/orchestrator.js";
export type { GameOrchestratorCallbacks, OwnerUiEventResult } from "./games/orchestrator.js";
export {
  findModuleEmbed,
  findActiveGameInFeed,
  isGameModule,
  isGameEnded,
  isActiveShellGameOnFeed,
  gameStateFromProps,
} from "./games/feed.js";
export type { ModuleEmbedTarget, ActiveChatGame } from "./games/feed.js";
export {
  gameModuleInComposition,
  sanitizeNewGameComposition,
  allowCompositionDuringGame,
  activeGameContext,
} from "./games/policies.js";
export type { GameEngine, GameMoveResult, GamePlayer, GameStatus } from "./games/engine.js";
export type { TttState, TttMove, TttMark } from "./games/tictactoe.js";
export type {
  BattleshipsState,
  BattleshipsMove,
  BattleshipsPhase,
  BattleshipsLevel,
  BattleshipsShot,
} from "./games/battleships.js";
export {
  BattleshipsA2AHost,
  parseBattleshipsPublicState,
  parseBattleshipsMovePayload,
  seatToPlayer,
  playerToSeat,
} from "./games/battleshipsA2a.js";
export type {
  BsSeat,
  BattleshipsPublicState,
  BsSeatBoardView,
} from "./games/battleshipsA2a.js";



export { registerCorePrimitives, CORE_PRIMITIVES } from "./core-primitives.js";
export { registerEcosystemModules, ECOSYSTEM_MODULE_MANIFESTS } from "./ecosystemModules.js";



export { validateComposition, validateConsequentialAction } from "./validate.js";

export type { ValidationResult } from "./validate.js";

export {
  parseAgentProtocolMessage,
  parseCompositionValue,
  parseConsequentialPayload,
  parseDataRequestPayload,
  parseGameMovePayload,
} from "./agentOutput.js";
export type { AgentWireResult, AgentWireReject } from "./agentOutput.js";

export { presentChatAgentError } from "./userFacingErrors.js";

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
export { createIndexedDbPersistence, createTieredJsonPersistence } from "./indexedDbPersistence.js";
export type { AsyncJsonPersistence } from "./indexedDbPersistence.js";

export {

  ModuleRegistry,

  collectComponentReferences,

  fetchRegistryRatings,

  formatStarRating,

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

  createRevocationEntry,

  upsertRevocation,

  verifyManifestSignature,

  isSigstoreBundleShape,

  bundleStatementReferencesDigest,

  validateModulePricing,

  normalizeModulePricing,

  formatModulePrice,

  modulePriceLabel,

  MODULE_STORE_BETA_FREE,

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

  ModuleRatingSummary,

  RegistryRatings,

  ModulePricing,

} from "./registry.js";

export {
  validateHttpsUrl,
  resolveModuleBundleOrigin,
  isCrossOriginModuleBundle,
} from "./security/url.js";

export {
  PRODUCTION_SHELL_ORIGIN,
  PRODUCTION_REGISTRY_ORIGIN,
  PRODUCTION_REGISTRY_INDEX_URL,
} from "./platformUrls.js";

