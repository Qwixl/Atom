import type { AtomAccountType } from "./hostedAccount.js";
import type { BillingLane, ReadinessSkuId } from "./planLanes.js";
import { notificationHint, notificationLabel } from "./planLanes.js";

export type PayPitch = {
  headline: string;
  lead: string;
  benefits: string[];
  closing: string;
};

/** D108 / Standby: daily update included on every Activity tier (email first). */
export const DAILY_ACTIONS_EMAIL_LINE =
  "Daily Actions email included with every plan (you can turn it off later).";

/** Matches Atom-MC `planCatalog.ts` Standard included credits. */
const STANDARD_INCLUDED_CREDITS: Record<ReadinessSkuId, string> = {
  on_when_needed: "£12.50",
  keeps_in_touch: "£17",
  always_ready: "£17",
  open_for_business: "£20",
};

function creditsBenefit(lane: "standard" | "byok", skuId: ReadinessSkuId): string {
  if (lane === "standard") {
    const amount = STANDARD_INCLUDED_CREDITS[skuId];
    return `${amount}/month Agent Credits included for chat and speech (and Agent Spend on Standard).`;
  }
  return "You bring your own AI key for chat; subscription covers hosting. Top up separately for speech and Agent Spend.";
}

/**
 * Pay-step sales copy from real entitlements (SIGNUP-PLAN-01).
 * No marketplace-apology / “not a shop” wording.
 */
export function payPitchFor(input: {
  accountType: AtomAccountType;
  lane: "standard" | "byok";
  readinessSkuId: ReadinessSkuId;
}): PayPitch {
  const { accountType, lane, readinessSkuId } = input;
  const credits = creditsBenefit(lane, readinessSkuId);
  const notify = `Notifications: ${notificationLabel(readinessSkuId)} — ${notificationHint(readinessSkuId)}`;

  if (accountType === "business") {
    return {
      headline: "Open for business",
      lead: "Your Business Agent on Atom — always on for customers and other agents.",
      benefits: [
        "Always-on merchant agent on the Atom network.",
        "Agent Business Knowledge: Brand voice, Policies, FAQs, and Catalog — sync from Profile.",
        "Signed offers built from your catalog (price and terms from your data).",
        "Customers pay you on your Stripe Checkout.",
        "No Atom transaction fees on those sales.",
        "Storefront agent card and domain-linked listing path.",
        "Agent tools: chat, messages, rooms, modules, and connectors.",
        DAILY_ACTIONS_EMAIL_LINE,
        credits,
      ],
      closing: "You’ll confirm payment on the next screen, then we finish setup.",
    };
  }

  if (accountType === "developer") {
    return {
      headline: "Build and share on Atom",
      lead: "A hosted developer workspace: publish modules and connectors into owner-owned shells.",
      benefits: [
        "Hosted agent to develop and dogfood — chat, messages, and rooms.",
        "Author and publish modules and connectors others can install.",
        "Registry, docs, and playground path for build → verify → publish.",
        "Install modules and connectors in your own account while you build.",
        notify,
        DAILY_ACTIONS_EMAIL_LINE,
        credits,
      ],
      closing: "You’ll confirm payment on the next screen, then we finish setup.",
    };
  }

  return {
    headline: "Your agent, your portal",
    lead: "A hosted personal agent that coordinates with businesses and other agents — you approve what matters.",
    benefits: [
      "Chat, encrypted messages, and rooms in one place.",
      "Talks to Business Agents: evaluates offers against your preferences, then you confirm.",
      "Agent Shopping with spend limits you set.",
      "Memory stays with your agent — export and leave anytime.",
      "Modules and connectors under your control.",
      notify,
      DAILY_ACTIONS_EMAIL_LINE,
      credits,
    ],
    closing: "You’ll confirm payment on the next screen, then we finish setup.",
  };
}

export function payPitchLane(lane: BillingLane): "standard" | "byok" {
  return lane === "byok" ? "byok" : "standard";
}
