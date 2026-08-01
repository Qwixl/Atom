/**
 * Signing and verifying Atom agent cards, using A2A v1.0's card signatures.
 *
 * Until v1.0 there was nowhere on a card to put a signature, so Atom established
 * that a card was genuine by fetching it over HTTPS and believing what it said.
 * That proves control of the domain and nothing about the agent: any domain could
 * publish a card claiming any `agentDid`, and domain verification would accept it.
 *
 * A signed card closes that. The signature is a JWS over the JCS canonicalization
 * of the card, and the `kid` is the agent's `did:key` — which means verification
 * needs no key server, no JWKS endpoint and no second network request: the
 * verifying key is inside the identifier being claimed. Presenting a card for a
 * DID you do not hold now requires a signature you cannot produce.
 */

import { AgentCard, generateAgentCardSignature, verifyAgentCardSignature } from "@a2a-js/sdk";
import { didToPublicKey, type AgentKeyPair } from "@qwixl/protocol";

const ALG = "EdDSA";

/**
 * Put a card into the exact form the verifier will canonicalize.
 *
 * The SDK's sign and verify paths are not symmetric: signing canonicalizes the
 * card object as given, while verification first round-trips it through
 * `AgentCard.fromJSON`/`toJSON` and canonicalizes the result. Any field the
 * round-trip normalises — an omitted default, an empty array — changes the bytes
 * between the two, and the signature then fails to verify against the card it was
 * made from. Normalising before signing makes both sides hash the same document.
 */
function normalizeCard(card: AgentCard): AgentCard {
  return AgentCard.toJSON(AgentCard.fromJSON(card)) as AgentCard;
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

// `alg` belongs on the key itself: jose refuses to import a JWK without one
// unless the caller supplies it, and the SDK imports our key without arguments.
function privateJwk(identity: AgentKeyPair) {
  return {
    kty: "OKP",
    crv: "Ed25519",
    alg: ALG,
    x: base64url(identity.publicKey),
    d: base64url(identity.privateKey),
  };
}

function publicJwkForDid(did: string) {
  return { kty: "OKP", crv: "Ed25519", alg: ALG, x: base64url(didToPublicKey(did)) };
}

/**
 * Fields the SDK's v0.3 card translator reads with bare property access
 * (`.length`, `Object.keys`, spreads).
 *
 * Signing must hash the protobuf-normal form — empty containers omitted — or
 * verification fails (see `normalizeCard`). Serving that same stripped object
 * then crashes the legacy well-known handler (`Object.keys(undefined)`,
 * `examples.length` on undefined), so every peer that omits `A2A-Version`
 * gets HTTP 500. Keep the caller-supplied shape for serving and only attach the
 * signatures produced over the normalised form; verification re-normalises
 * before hashing, so the signature still checks.
 */
function withSignatures(card: AgentCard, signatures: AgentCard["signatures"]): AgentCard {
  return {
    ...card,
    securitySchemes: card.securitySchemes ?? {},
    securityRequirements: card.securityRequirements ?? [],
    signatures: signatures ?? [],
    skills: (card.skills ?? []).map((skill) => ({
      ...skill,
      tags: skill.tags ?? [],
      examples: skill.examples ?? [],
      inputModes: skill.inputModes ?? [],
      outputModes: skill.outputModes ?? [],
      securityRequirements: skill.securityRequirements ?? [],
    })),
  };
}

/** Sign a card with the agent's `did:key` identity, returning the signed card. */
export async function signAtomAgentCard(
  card: AgentCard,
  identity: AgentKeyPair,
): Promise<AgentCard> {
  const sign = generateAgentCardSignature(privateJwk(identity), {
    alg: ALG,
    kid: identity.did,
    typ: "JOSE",
  });
  const signed = await sign(normalizeCard(card));
  return withSignatures(card, signed.signatures);
}

/**
 * Verify a card against the DID named in its own signature header, and return
 * that DID.
 *
 * The DID is taken from the signature rather than supplied by the caller because
 * the question this answers is "who produced this card", not "did a particular
 * agent produce it". Callers that expected a specific agent compare the returned
 * DID themselves — `domainVerification` does exactly that.
 */
export async function verifyAtomAgentCard(card: AgentCard): Promise<string> {
  const signatures = card.signatures ?? [];
  if (signatures.length === 0) throw new Error("Agent card is not signed");

  let signerDid = "";
  const verify = verifyAgentCardSignature(async (kid) => {
    if (!kid?.startsWith("did:key:")) {
      throw new Error(`Agent card signature kid is not a did:key: ${kid}`);
    }
    signerDid = kid;
    return publicJwkForDid(kid);
  });

  await verify(card);
  if (!signerDid) throw new Error("Agent card signature did not identify a signer");
  return signerDid;
}

/** The agent DID a card advertises through its Atom extensions, if any. */
export function advertisedAgentDid(card: AgentCard): string | undefined {
  for (const extension of card.capabilities?.extensions ?? []) {
    const did = (extension.params as { agentDid?: unknown } | undefined)?.agentDid;
    if (typeof did === "string" && did.startsWith("did:key:")) return did;
  }
  return undefined;
}
