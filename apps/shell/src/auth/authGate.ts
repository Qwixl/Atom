import { loadFirstRunDone } from "../firstRunStorage.js";
import { isSupabaseConfigured, MANAGED_HOSTING } from "../hostConfig.js";
import { supabaseAccessToken } from "./hostedAccount.js";
import { isDemoSessionActive } from "../demo/demoSessionStorage.js";

export type AuthGateResult =
  | { status: "ready" }
  | { status: "redirect"; href: string }
  | { status: "checking" };

/** Returns whether the live app (not demo) may load. */
export async function checkLiveAppAuth(): Promise<AuthGateResult> {
  if (isDemoSessionActive()) {
    return { status: "redirect", href: "/app/?demo=session" };
  }

  if (MANAGED_HOSTING && isSupabaseConfigured()) {
    const token = await supabaseAccessToken();
    if (!token) {
      return { status: "redirect", href: "/app/?auth=login" };
    }
    if (!loadFirstRunDone()) {
      return { status: "redirect", href: "/app/?auth=register" };
    }
    return { status: "ready" };
  }

  if (!loadFirstRunDone()) {
    return { status: "redirect", href: "/app/?auth=register" };
  }

  return { status: "ready" };
}
