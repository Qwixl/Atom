/** Atom data-object payload carried inside A2A message parts. */
export const ATOM_DATA_OBJECT_MEDIA_TYPE =
  "application/vnd.atom.data-object+json;version=1";

/** MLS ciphertext wire bytes (RFC 9420) carried inside A2A message parts. */
export const ATOM_MLS_WIRE_MEDIA_TYPE =
  "application/vnd.atom.mls-wire+cbor;version=1";

/** MLS pair handshake metadata (Welcome + ratchet tree) over A2A between agent backends. */
export const ATOM_MLS_HANDSHAKE_MEDIA_TYPE =
  "application/vnd.atom.mls-handshake+json;version=1";

export const ATOM_A2A_EXTENSION = "https://atom.qwixl.dev/a2a/data-object/v1";

/** Default A2A skill id for comms data-object exchange. */
export const ATOM_COMMS_SKILL_ID = "atom-comms";

/** Default A2A skill id for M8 coordination (scheduling / RSVP). */
export const ATOM_COORDINATION_SKILL_ID = "atom-coordination";

/** Default purpose for Phase 1 private comms. */
export const COMMS_MESSAGE_PURPOSE = "comms:message";

/** Schema for Phase 1 chat message payloads (`payload.text`). */
export const COMMS_MESSAGE_SCHEMA = "https://atom.qwixl.dev/schema/CommsMessage";

/** Default purpose for delivery receipts. */
export const COMMS_RECEIPT_PURPOSE = "comms:receipt";

/** Purpose for online first-contact invitation tokens (D026). */
export const CONTACT_INVITE_PURPOSE = "contact:invite";

/** M8 coordination — scheduling proposal (organizer → invitee). */
export const COORDINATION_PROPOSAL_PURPOSE = "coordination:proposal";
export const SCHEDULING_PROPOSAL_SCHEMA = "https://atom.qwixl.dev/schema/SchedulingProposal";

/** M8 coordination — slot selection / counter (invitee → organizer). */
export const COORDINATION_RESPONSE_PURPOSE = "coordination:response";
export const SCHEDULING_RESPONSE_SCHEMA = "https://atom.qwixl.dev/schema/SchedulingResponse";

/** M8 coordination — RSVP request (organizer → invitee). */
export const COORDINATION_RSVP_PURPOSE = "coordination:rsvp";
export const RSVP_REQUEST_SCHEMA = "https://atom.qwixl.dev/schema/RsvpRequest";

/** M8 coordination — RSVP answer (invitee → organizer). */
export const COORDINATION_RSVP_RESPONSE_PURPOSE = "coordination:rsvp-response";
export const RSVP_RESPONSE_SCHEMA = "https://atom.qwixl.dev/schema/RsvpResponse";

/** M8 coordination — attested outcome receipt (either direction). */
export const COORDINATION_RECEIPT_PURPOSE = "coordination:receipt";
export const COORDINATION_RECEIPT_SCHEMA = "https://atom.qwixl.dev/schema/CoordinationReceipt";

/** All M8 coordination purposes (receiver allowlists). */
export const COORDINATION_PURPOSES = [
  COORDINATION_PROPOSAL_PURPOSE,
  COORDINATION_RESPONSE_PURPOSE,
  COORDINATION_RSVP_PURPOSE,
  COORDINATION_RSVP_RESPONSE_PURPOSE,
  COORDINATION_RECEIPT_PURPOSE,
] as const;

/** M9 transaction-flow — soft reserve after owner confirm (no ring-fence). */
export const ACTION_RESERVE_PURPOSE = "action:reserve";
export const ACTION_RESERVE_SCHEMA = "https://atom.qwixl.dev/schema/ActionReserve";

/** Default A2A skill id for M9 low-stakes actions. */
export const ATOM_ACTIONS_SKILL_ID = "atom-actions";

/** Default A2A skill id for M12 commerce (intent / offer). */
export const ATOM_COMMERCE_SKILL_ID = "atom-commerce";

/** Atom business profile extension on agent cards (M12.4). */
export const ATOM_BUSINESS_EXTENSION = "https://atom.qwixl.dev/a2a/business/v1";

/** M12 commerce — purchase intent broadcast (buyer → seller). */
export const COMMERCE_INTENT_PURPOSE = "commerce:intent";
export const COMMERCE_INTENT_SCHEMA = "https://atom.qwixl.dev/schema/CommerceIntent";

/** M12 commerce — signed offer with rankable structured terms (seller → buyer). */
export const COMMERCE_OFFER_PURPOSE = "commerce:offer";
export const COMMERCE_OFFER_SCHEMA = "https://atom.qwixl.dev/schema/CommerceOffer";

/** M12 commerce — no matching catalog item (seller → buyer). */
export const COMMERCE_DECLINE_PURPOSE = "commerce:decline";
export const COMMERCE_DECLINE_SCHEMA = "https://atom.qwixl.dev/schema/CommerceDecline";

/** All M12 commerce purposes (receiver allowlists). */
export const COMMERCE_PURPOSES = [
  COMMERCE_INTENT_PURPOSE,
  COMMERCE_OFFER_PURPOSE,
  COMMERCE_DECLINE_PURPOSE,
] as const;

/** Plain-language tier-1 disclosure (D039). */
export const BUSINESS_VERIFICATION_TIER_1_LABEL =
  "Domain-linked — domain control only, not legal-entity verification";

/** M9 transaction-flow — authorization hold placed on a payment rail (ring-fence). */
export const ACTION_HOLD_PURPOSE = "action:hold";
export const ACTION_HOLD_SCHEMA = "https://atom.qwixl.dev/schema/ActionHold";

/** M11 transaction-flow — capture of a previously placed hold after mutual confirm. */
export const ACTION_CAPTURE_PURPOSE = "action:capture";
export const ACTION_CAPTURE_SCHEMA = "https://atom.qwixl.dev/schema/ActionCapture";

/** M11 transaction-flow — compensating release of a hold (decline, timeout, failure). */
export const ACTION_RELEASE_PURPOSE = "action:release";
export const ACTION_RELEASE_SCHEMA = "https://atom.qwixl.dev/schema/ActionRelease";

/** M11 transaction-flow — party confirm before capture (shell attestation). */
export const ACTION_CONFIRM_PURPOSE = "action:confirm";
export const ACTION_CONFIRM_SCHEMA = "https://atom.qwixl.dev/schema/ActionConfirm";

/** M11 transaction-flow — signed receipt after capture (both parties retain). */
export const ACTION_RECEIPT_PURPOSE = "action:receipt";
export const ACTION_RECEIPT_SCHEMA = "https://atom.qwixl.dev/schema/ActionReceipt";

/** M11.6 transaction-flow — qualify step with VC/PSI presentation (proof-not-data). */
export const ACTION_QUALIFY_PURPOSE = "action:qualify";
export const ACTION_QUALIFY_SCHEMA = "https://atom.qwixl.dev/schema/ActionQualify";

/** M11.7 dispute evidence — selective anchor of bilateral channel head hash. */
export const ACTION_ANCHOR_PURPOSE = "action:anchor";
export const ACTION_ANCHOR_SCHEMA = "https://atom.qwixl.dev/schema/ActionAnchor";

/** All M9 action purposes (receiver allowlists). */
export const ACTION_PURPOSES = [ACTION_RESERVE_PURPOSE] as const;

/** M11.6 qualify purposes (receiver allowlists). */
export const QUALIFY_PURPOSES = [ACTION_QUALIFY_PURPOSE] as const;

/** M11.7 channel purposes (receiver allowlists). */
export const CHANNEL_PURPOSES = [ACTION_ANCHOR_PURPOSE] as const;

/** All M11 transaction purposes (receiver allowlists). */
export const TRANSACTION_PURPOSES = [
  ACTION_HOLD_PURPOSE,
  ACTION_CONFIRM_PURPOSE,
  ACTION_CAPTURE_PURPOSE,
  ACTION_RELEASE_PURPOSE,
  ACTION_RECEIPT_PURPOSE,
] as const;

/** Default soft-hold lifetime for action:reserve (24 hours). */
export const DEFAULT_ACTION_RESERVE_TTL_SECONDS = 24 * 60 * 60;

/** Default authorization-hold lifetime (7 days — card-network auth window). */
export const DEFAULT_ACTION_HOLD_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Default coordination object lifetime: 14 days. */
export const DEFAULT_COORDINATION_TTL_SECONDS = 14 * 24 * 60 * 60;

/** Default qualify presentation lifetime: 14 days. */
export const DEFAULT_ACTION_QUALIFY_TTL_SECONDS = 14 * 24 * 60 * 60;

/** Default channel anchor lifetime: 90 days (dispute evidence retention). */
export const DEFAULT_CHANNEL_ANCHOR_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Default commerce object lifetime: 14 days. */
export const DEFAULT_COMMERCE_TTL_SECONDS = 14 * 24 * 60 * 60;
