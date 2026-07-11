import { useCallback, useEffect, useMemo, useState } from "react";
import { CommsAgentClient } from "./client.js";
import { mintChatSessionToken, setChatSessionToken } from "./chatSessionToken.js";
import { loadCommsAgentConfig, refreshCommsConfigCache } from "./storage.js";
import type { CommsAgentConfig } from "./types.js";
import { usesSupabaseHostedAuth } from "../hostConfig.js";

/** Load agent URL + token (including from the unlocked vault) for API clients. */
export function useAgentConfig(vaultUnlocked: boolean): {
  config: CommsAgentConfig;
  client: CommsAgentClient;
  reload: () => Promise<CommsAgentConfig>;
} {
  const [config, setConfig] = useState(() => loadCommsAgentConfig());
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const next = vaultUnlocked ? await refreshCommsConfigCache() : loadCommsAgentConfig();
    const canMint = Boolean(next.adminToken?.trim()) || usesSupabaseHostedAuth();
    if (vaultUnlocked && canMint) {
      const minted = await mintChatSessionToken(next);
      setChatSessionToken(minted);
      setSessionToken(minted);
    } else {
      setChatSessionToken(null);
      setSessionToken(null);
    }
    setConfig(next);
    return next;
  }, [vaultUnlocked]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const client = useMemo(
    () =>
      new CommsAgentClient(config.adminUrl, {
        readToken: sessionToken ?? config.adminToken,
        adminToken: config.adminToken,
      }),
    [config.adminUrl, config.adminToken, sessionToken],
  );

  return { config, client, reload };
}
