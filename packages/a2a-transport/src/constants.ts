/** Atom data-object payload carried inside A2A message parts. */
export const ATOM_DATA_OBJECT_MEDIA_TYPE =
  "application/vnd.atom.data-object+json;version=1";

/** MLS ciphertext wire bytes (RFC 9420) carried inside A2A message parts. */
export const ATOM_MLS_WIRE_MEDIA_TYPE =
  "application/vnd.atom.mls-wire+cbor;version=1";

export const ATOM_A2A_EXTENSION = "https://atom.qwixl.dev/a2a/data-object/v1";

/** Default A2A skill id for comms data-object exchange. */
export const ATOM_COMMS_SKILL_ID = "atom-comms";

/** Default purpose for Phase 1 private comms. */
export const COMMS_MESSAGE_PURPOSE = "comms:message";

/** Default purpose for delivery receipts. */
export const COMMS_RECEIPT_PURPOSE = "comms:receipt";
