import { loadFirstRunDone, resetFirstRunDone } from "../firstRunStorage.js";
import { isSupabaseConfigured, MANAGED_HOSTING } from "../hostConfig.js";
import {
  isHostedSubscriptionProvisionable,
  supabaseAccessToken,
} from "./hostedAccount.js";
import { clearDemoSession, isDemoSessionActive } from "../demo/demoSessionStorage.js";

export type AuthGateResult =
  | { status: "ready" }
  | { status: "redirect"; href: string }
  | { status: "checking" };

/** Returns whether the live app (not demo) may load. */
export async function checkLiveAppAuth(): Promise<AuthGateResult> {
  // Hosted account session always wins over a leftover demo flag from this tab.
  if (MANAGED_HOSTING && isSupabaseConfigured()) {
    const token = await supabaseAccessToken();
    if (token) {
      if (isDemoSessionActive()) clearDemoSession();
      // Supabase auth alone is not enough — require Stripe-backed entitlement.
      if (!(await isHostedSubscriptionProvisionable())) {
        // Stale first-run flag must not strand unpaid users on credentials.
        resetFirstRunDone();
        return { status: "redirect", href: "/app/?auth=register" };
      }
      if (!loadFirstRunDone()) {
        return { status: "redirect", href: "/app/?auth=register" };
      }
      return { status: "ready" };
    }
  }

  if (isDemoSessionActive()) {
    return { status: "redirect", href: "/app/?demo=session" };
  }

  if (MANAGED_HOSTING && isSupabaseConfigured()) {
    return { status: "redirect", href: "/app/?auth=login" };
  }

  if (!loadFirstRunDone()) {
    return { status: "redirect", href: "/app/?auth=register" };
  }

  return { status: "ready" };
}
