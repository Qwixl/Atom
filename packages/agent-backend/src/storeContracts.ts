/**
 * Agent-backend store durability contracts (D048).
 *
 * v1 ships minimal engines to prove product loops. Production backends swap via
 * env/factory without changing admin routes or protocol surfaces. See
 * docs/02-architecture/20-v1-production-gaps.md (private) and AGENT-BACKEND.md § V1 scope.
 */

/** How the current implementation persists data. */
export type StoreDurability = "ephemeral-v1" | "json-v1" | "encrypted-json-v1";

/** Planned production backend for this store (when durability is insufficient). */
export type StoreProductionBackend = "json" | "sqlite" | "remote" | "encrypted-json";

export interface AgentStoreMeta {
  readonly id: string;
  readonly durability: StoreDurability;
  readonly productionBackend: StoreProductionBackend;
  /** Human-readable v1 limit or gap. */
  readonly v1Note: string;
}

export const AGENT_STORE_REGISTRY: Record<string, AgentStoreMeta> = {
  businessKnowledge: {
    id: "businessKnowledge",
    durability: "json-v1",
    productionBackend: "sqlite",
    v1Note: "Small reference corpora only (~200 docs / ~2M chars). ATOM_BUSINESS_KNOWLEDGE_BACKEND.",
  },
  businessCatalog: {
    id: "businessCatalog",
    durability: "json-v1",
    productionBackend: "json",
    v1Note: "JSON file; sufficient for typical catalogs until feed import (M12.6 step 2).",
  },
  businessContext: {
    id: "businessContext",
    durability: "json-v1",
    productionBackend: "json",
    v1Note: "Brand voice only; policies belong in knowledge RAG.",
  },
  businessVerification: {
    id: "businessVerification",
    durability: "ephemeral-v1",
    productionBackend: "json",
    v1Note: "Lost on restart except ATOM_BUSINESS_DOMAIN env shortcut.",
  },
  commerceIntents: {
    id: "commerceIntents",
    durability: "ephemeral-v1",
    productionBackend: "json",
    v1Note: "In-memory intent queue; no cross-restart idempotency.",
  },
  transactionCommit: {
    id: "transactionCommit",
    durability: "ephemeral-v1",
    productionBackend: "json",
    v1Note: "M11 commit state lost on restart; blocks production commerce recovery.",
  },
  disputeChannel: {
    id: "disputeChannel",
    durability: "ephemeral-v1",
    productionBackend: "json",
    v1Note: "Bilateral channel snapshots in memory only.",
  },
  qualify: {
    id: "qualify",
    durability: "ephemeral-v1",
    productionBackend: "json",
    v1Note: "Qualify history not persisted.",
  },
  inbox: {
    id: "inbox",
    durability: "ephemeral-v1",
    productionBackend: "json",
    v1Note: "Received object log; no replay after restart.",
  },
  mlsSessions: {
    id: "mlsSessions",
    durability: "json-v1",
    productionBackend: "encrypted-json",
    v1Note: "Snapshots on disk; live sessions in memory (D025). Pair re-handshake on failure.",
  },
  connectorVault: {
    id: "connectorVault",
    durability: "encrypted-json-v1",
    productionBackend: "encrypted-json",
    v1Note: "Local encrypted file; hosted path needs KMS/HSM (D044, Q20).",
  },
  rooms: {
    id: "rooms",
    durability: "json-v1",
    productionBackend: "sqlite",
    v1Note: "JSON room state; pagination and fan-out deferred (Q21).",
  },
  trustedAgents: {
    id: "trustedAgents",
    durability: "json-v1",
    productionBackend: "json",
    v1Note: "Address book block/mute policy enforced on /send and inbound delivery (M17.5).",
  },
  custodyApprovals: {
    id: "custodyApprovals",
    durability: "ephemeral-v1",
    productionBackend: "json",
    v1Note: "Pending WebAuthn approvals in memory.",
  },
};
