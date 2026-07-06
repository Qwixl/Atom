const CHANNEL_NAME = "atom-email-confirmed";
const CONFIRMED_AT_KEY = "atom:email-confirmed-at";
const CLAIMED_AT_KEY = "atom:email-confirm-claimed";

export function hasSupabaseAuthCallbackInUrl(): boolean {
  const hash = window.location.hash;
  const params = new URLSearchParams(window.location.search);
  return (
    hash.includes("access_token=") ||
    hash.includes("error=") ||
    params.has("code") ||
    params.has("token_hash")
  );
}

export function notifyEmailConfirmed(): void {
  const at = Date.now();
  try {
    localStorage.setItem(CONFIRMED_AT_KEY, String(at));
  } catch {
    /* private mode */
  }
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: "confirmed", at });
    channel.close();
  } catch {
    /* unsupported */
  }
}

export function claimEmailConfirmation(): void {
  try {
    localStorage.setItem(CLAIMED_AT_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
}

/** True when another tab claimed confirmation within the last few seconds. */
export function wasEmailConfirmationClaimedRecently(withinMs = 3000): boolean {
  try {
    const raw = localStorage.getItem(CLAIMED_AT_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < withinMs;
  } catch {
    return false;
  }
}

export function subscribeToEmailConfirmed(onConfirmed: () => void): () => void {
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener("message", onConfirmed);
  } catch {
    /* unsupported */
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === CONFIRMED_AT_KEY && event.newValue) onConfirmed();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    channel?.removeEventListener("message", onConfirmed);
    channel?.close();
    window.removeEventListener("storage", onStorage);
  };
}
