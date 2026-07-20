import { useCallback, useEffect, useMemo, useState } from "react";
import { CommsAgentClient } from "./client.js";
import {
  getChatSessionToken,
  mintChatSessionToken,
  setChatSessionToken,
} from "./chatSessionToken.js";
import { loadCommsAgentConfig, refreshCommsConfigCache } from "./storage.js";
import type { CommsAgentConfig } from "./types.js";
import { usesSupabaseHostedAuth } from "../hostConfig.js";
import { tryReconnectHostedAgent } from "../auth/completeSetup.js";

/** Load agent URL + token (including from the unlocked vault) for API clients. */
export function useAgentConfig(vaultUnlocked: boolean): {
  config: CommsAgentConfig;
  client: CommsAgentClient;
  /** True once a session or admin bearer is available for authenticated agent calls. */
  sessionReady: boolean;
  reload: () => Promise<CommsAgentConfig>;
} {
  const [config, setConfig] = useState(() => loadCommsAgentConfig());
  const [sessionToken, setSessionToken] = useState<string | null>(() => getChatSessionToken());
  const [sessionReady, setSessionReady] = useState(() => Boolean(getChatSessionToken()));

  const reload = useCallback(async () => {
    const next = vaultUnlocked ? await refreshCommsConfigCache() : loadCommsAgentConfig();
    const canMint = Boolean(next.adminToken?.trim()) || usesSupabaseHostedAuth();

    if (vaultUnlocked && canMint) {
      let minted = await mintChatSessionToken(next);
      if (!minted && usesSupabaseHostedAuth()) {
        if (await tryReconnectHostedAgent()) {
          minted = getChatSessionToken() ?? (await mintChatSessionToken(await refreshCommsConfigCache()));
        }
      }
      if (minted) {
        setChatSessionToken(minted);
        setSessionToken(minted);
      }
      const ready = Boolean(minted || getChatSessionToken() || next.adminToken?.trim());
      setSessionReady(ready);
    } else {
      const existing = getChatSessionToken();
      setSessionToken(existing);
      setSessionReady(Boolean(existing || next.adminToken?.trim()));
    }

    const resolved = vaultUnlocked ? await refreshCommsConfigCache() : next;
    setConfig(resolved);
    return resolved;
  }, [vaultUnlocked]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const client = useMemo(
    () =>
      new CommsAgentClient(config.adminUrl, {
        readToken: sessionToken ?? getChatSessionToken() ?? config.adminToken,
        adminToken: config.adminToken,
      }),
    [config.adminUrl, config.adminToken, sessionToken],
  );

  return { config, client, sessionReady, reload };
}
