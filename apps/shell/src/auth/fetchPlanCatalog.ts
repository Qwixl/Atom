import { CONTROL_PLANE_URL } from "../hostConfig.js";

/** Shape returned by Atom-MC GET /billing/plans (Qwixl commercial catalog). */
export type RemotePlanCatalog = {
  currency: string;
  lanes: {
    standard: {
      displayFrom: string;
      summary: string;
      skus: Record<
        string,
        { id: string; displayName: string; displayPrice: string; unitAmountPence: number }
      >;
      modelTiers?: Record<string, { id: string; displayName: string; default?: boolean }>;
    };
    byok: {
      displayFrom: string;
      summary: string;
      skus: Record<
        string,
        { id: string; displayName: string; displayPrice: string; unitAmountPence: number }
      >;
    };
    self_hosted: { displayFrom: string; summary: string };
  };
  topUpPacksPence: number[];
};

/** Fetch Qwixl plan catalog from Atom-MC. Returns null when CP is stub / offline. */
export async function fetchPlanCatalog(): Promise<RemotePlanCatalog | null> {
  const base = CONTROL_PLANE_URL?.replace(/\/$/, "");
  if (!base) return null;
  try {
    const resp = await fetch(`${base}/billing/plans`, {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) return null;
    return (await resp.json()) as RemotePlanCatalog;
  } catch {
    return null;
  }
}
