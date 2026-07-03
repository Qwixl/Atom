import {
  getCiphersuiteFromName,
  getCiphersuiteImpl,
  type CiphersuiteImpl,
} from "ts-mls";

/** Default MLS ciphersuite for Atom agent pair sessions (RFC 9420 mandatory). */
export const DEFAULT_CIPHERSUITE_NAME =
  "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519";

let cached: CiphersuiteImpl | undefined;

export async function defaultCiphersuite(): Promise<CiphersuiteImpl> {
  if (!cached) {
    cached = await getCiphersuiteImpl(getCiphersuiteFromName(DEFAULT_CIPHERSUITE_NAME));
  }
  return cached;
}
