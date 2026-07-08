export { OwnerStore, GUARD_BY_DEFAULT_CATEGORIES, defaultGuardForCategory } from "./OwnerStore.js";
export type {
  OwnerRecord,
  ProfileContext,
  ProfileContextOpenRecord,
  RecordProposal,
  RecordCondition,
} from "./OwnerStore.js";
export { formatRecordValue } from "./formatRecordValue.js";
export {
  ConversationMemoryIndex,
  scoreTokenOverlap,
  tokenize,
  type MemoryChunk,
} from "./conversationMemory.js";
export {
  buildPersonalAgentContext,
  type PersonalAgentContext,
  type PersonalAgentContextOptions,
  ATOM_AGUI_PROFILE_PROP,
  retrieveRecordSnippets,
} from "./personalAgentContext.js";
export {
  resolveRecordValue,
  formatConditionalValue,
  formatSplitProposal,
  hasTagContextConflict,
  evidenceSuggestsConditionalSplit,
  mergeConditions,
  normalizeConditions,
  shouldProposeConditionalSplit,
} from "./conditionalValue.js";
export {
  hashEmbedText,
  embedTextViaApi,
  cosineSimilarity,
  hybridRetrievalScore,
  type TextEmbedder,
} from "./textEmbedding.js";
export { buildProfileSummaryByCategory } from "./profileSummary.js";
export {
  COMMERCE_RECEIPT_CATEGORY,
  buildCommerceReceiptUpsert,
  formatCommerceReceiptLabel,
  parseAttestationRef,
  verifyAttestationCrossRef,
  type AttestationCrossRefEntry,
  type CommerceReceiptAmount,
  type CommerceReceiptValue,
} from "./commerceReceipt.js";
export {
  BUSINESS_BRAND_CATEGORY,
  BUSINESS_KNOWLEDGE_CATEGORY,
  BUSINESS_CATALOG_CATEGORY,
  BUSINESS_CATEGORIES,
  BUSINESS_POLICY_CATEGORY,
  catalogItemsFromStore,
  isBusinessCatalogItemValue,
  parseBusinessCatalogItem,
  type BusinessCatalogItemValue,
  type BusinessCategory,
} from "./businessSchema.js";
export {
  buildBusinessAgentContext,
  brandPolicyLinesFromRecords,
  formatBusinessAgentContext,
  formatBusinessAgentPrompt,
  mergeBusinessContextIntoProfile,
  type BusinessAgentContext,
} from "./businessAgentContext.js";
export {
  PERSONAL_MEMORY_V1_MAX_CHUNKS,
  PERSONAL_MEMORY_V1_SOFT_CHAR_LIMIT,
  parseEmbedderBackendKind,
  type EmbedderBackendKind,
} from "./v1Scope.js";
export { createTextEmbedder } from "./createTextEmbedder.js";
export { createApiTextEmbedder, embedTextAsync } from "./apiTextEmbedding.js";
export type { ApiTextEmbeddingOptions } from "./apiTextEmbedding.js";
export { matchCatalogForIntent, type CatalogIntentMatchInput, type CatalogMatchResult } from "./matchCatalogIntent.js";
export { activeContextTags } from "./evidenceHelpers.js";
export { recordUiPreferenceFeedback } from "./uiEvidence.js";
export { inferTier, normalizeTier, resolveTier, type PreferenceTier } from "./tier.js";
export {
  derivePreferenceWeights,
  evidenceKindForSignal,
  type CuratorSignal,
  type CuratorSignalKind,
  type DerivedPreferenceWeights,
  type EvidenceKind,
  type PreferenceEvidence,
} from "./evidence.js";
