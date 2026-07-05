/** Serialized MLS pair session for disk persistence (M13.3). */
export interface MlsPairSnapshot {
  version: 1;
  localDid: string;
  peerDid: string | null;
  groupStateB64: string;
}

/** Serialized MLS group session for disk persistence. */
export interface MlsGroupSnapshot {
  version: 1;
  localDid: string;
  roomId: string;
  memberDids: string[];
  groupStateB64: string;
}
