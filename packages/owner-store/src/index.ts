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
  cosineSimilarity,
  hybridRetrievalScore,
  type TextEmbedder,
} from "./textEmbedding.js";
export { buildProfileSummaryByCategory } from "./profileSummary.js";
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
