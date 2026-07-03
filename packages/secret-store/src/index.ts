export type { SecretRef, SecretStore } from "./types.js";
export { maskSecret } from "./maskSecret.js";
export { createLocalStorageSecretStore } from "./localStorageSecretStore.js";
export { createMemorySecretStore } from "./memorySecretStore.js";
export {
  createDefaultSecretStore,
  createLayeredSecretStore,
  type DefaultSecretStoreOptions,
  type SecretStoreBackend,
} from "./defaultSecretStore.js";
export {
  createProductionSecretStore,
  purgeInsecureLocalCredentials,
} from "./productionSecretStore.js";
export {
  loadLlmConnectionFromSession,
  persistLlmConnectionToSession,
  clearSessionLlmConnection,
} from "./sessionLlmConnection.js";
export {
  DEFAULT_LLM_SECRET_REF,
  LLM_CONNECTION_STORAGE_KEY,
  isLlmConnectionReady,
  loadAndMigrateLlmConnection,
  persistLlmConnection,
  resolveLlmConfig,
} from "./llmConnection.js";
export type { LlmConnectionConfig, ResolvedLlmConfig } from "./llmConnection.js";
