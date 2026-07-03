export type {
  AgentKeyPair,
  DataObject,
  DataObjectGovernance,
  DataObjectPayload,
  SemanticTag,
  UnsignedDataObject,
  ValidationResult,
  VerifyDataObjectOptions,
} from "./types.js";

export { stableStringify, signingPayload } from "./canonical.js";
export { didToPublicKey, isDidKey, publicKeyToDid } from "./did.js";
export { generateAgentKeyPair, signBytes, verifyBytes } from "./identity.js";
export {
  assertUsableObject,
  isExpired,
  isPurposeAllowed,
  resolveExpiry,
} from "./governance.js";
export { signDataObject, verifyDataObject, verifyDataObjectSignature } from "./envelope.js";
export { validateDataObject, validateUnsignedDataObject } from "./validate.js";
