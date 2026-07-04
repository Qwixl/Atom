/** Owner-store category for signed transaction receipts (M11.5). */
export const COMMERCE_RECEIPT_CATEGORY = "commerce-receipts";

export interface CommerceReceiptAmount {
  currency: string;
  amountMinor: number;
}

export interface CommerceReceiptValue {
  transactionId: string;
  receiptObjectId: string;
  railRef: string;
  amount: CommerceReceiptAmount;
  attestationRef: string;
  attestationSeq?: number;
  attestationVerified: boolean;
  capturedAt: string;
  peerDid: string;
  label?: string;
}

export interface AttestationCrossRefEntry {
  seq: number;
  hash: string;
}

export function parseAttestationRef(
  ref: string,
): { seq: number; hashPrefix: string } | null {
  const match = /^attestation:(\d+):([a-f0-9]+)$/i.exec(ref.trim());
  if (!match?.[2]) return null;
  return { seq: Number(match[1]), hashPrefix: match[2].toLowerCase() };
}

export function verifyAttestationCrossRef(
  attestationRef: string,
  entries: readonly AttestationCrossRefEntry[],
): { verified: boolean; seq?: number } {
  const parsed = parseAttestationRef(attestationRef);
  if (!parsed) return { verified: false };
  const entry = entries.find((e) => e.seq === parsed.seq);
  if (!entry) return { verified: false, seq: parsed.seq };
  const verified = entry.hash.toLowerCase().startsWith(parsed.hashPrefix);
  return { verified, seq: parsed.seq };
}

export function buildCommerceReceiptUpsert(input: {
  transactionId: string;
  receiptObjectId: string;
  railRef: string;
  amount: CommerceReceiptAmount;
  attestationRef: string;
  attestationEntries: readonly AttestationCrossRefEntry[];
  capturedAt: string;
  peerDid: string;
  label?: string;
}): {
  id: string;
  category: string;
  label: string;
  value: CommerceReceiptValue;
  guarded: boolean;
} {
  const crossRef = verifyAttestationCrossRef(input.attestationRef, input.attestationEntries);
  const amountLabel = `${(input.amount.amountMinor / 100).toFixed(2)} ${input.amount.currency}`;
  const label = input.label?.trim() || `Receipt ${input.transactionId}`;
  return {
    id: `receipt-${input.transactionId}`,
    category: COMMERCE_RECEIPT_CATEGORY,
    label,
    guarded: true,
    value: {
      transactionId: input.transactionId,
      receiptObjectId: input.receiptObjectId,
      railRef: input.railRef,
      amount: input.amount,
      attestationRef: input.attestationRef,
      attestationSeq: crossRef.seq,
      attestationVerified: crossRef.verified,
      capturedAt: input.capturedAt,
      peerDid: input.peerDid,
      label: input.label,
    },
  };
}

export function formatCommerceReceiptLabel(value: CommerceReceiptValue): string {
  const amount = `${(value.amount.amountMinor / 100).toFixed(2)} ${value.amount.currency}`;
  return `${amount} · ${value.transactionId}${value.attestationVerified ? "" : " (attestation unverified)"}`;
}
