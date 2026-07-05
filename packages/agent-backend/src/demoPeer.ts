import type { AgentKeyPair } from "@qwixl/protocol";
import { createSchedulingProposal } from "@qwixl/a2a-transport";
import { deliverSignedObject } from "./deliverObject.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import type { MlsPeerRecordStore } from "./mlsPeerRecords.js";

const DEMO_SLOTS = [
  { id: "demo-mon-10", label: "Mon 10:00", start: "2026-07-06T10:00:00Z", end: "2026-07-06T10:30:00Z" },
  { id: "demo-mon-14", label: "Mon 14:00", start: "2026-07-06T14:00:00Z", end: "2026-07-06T14:30:00Z" },
  { id: "demo-tue-11", label: "Tue 11:00", start: "2026-07-07T11:00:00Z", end: "2026-07-07T11:30:00Z" },
];

/** M14.6 — after MLS handshake, send a demo scheduling proposal to the connecting peer. */
export async function maybeSendDemoSchedulingProposal(opts: {
  enabled: boolean;
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  peerRecords: MlsPeerRecordStore;
  peerDid: string;
  peerEndpoint?: string;
}): Promise<void> {
  if (!opts.enabled) return;
  const peerUrl = opts.peerEndpoint?.trim() || opts.peerRecords.list().find((p) => p.peerDid === opts.peerDid)?.peerUrl;
  if (!peerUrl?.trim()) {
    console.warn("[demo-peer] no peer endpoint — skipping scheduling proposal");
    return;
  }
  if (!opts.mlsStore.hasSession(opts.peerDid)) {
    console.warn("[demo-peer] no MLS session — skipping scheduling proposal");
    return;
  }
  const object = await createSchedulingProposal({
    identity: opts.identity,
    payload: {
      title: "Demo intro call (Qwixl peer agent)",
      slots: DEMO_SLOTS,
    },
  });
  await deliverSignedObject({
    mlsStore: opts.mlsStore,
    peerUrl,
    peerDid: opts.peerDid,
    object,
    encrypt: true,
  });
  console.log(`[demo-peer] sent scheduling proposal to ${opts.peerDid}`);
}
