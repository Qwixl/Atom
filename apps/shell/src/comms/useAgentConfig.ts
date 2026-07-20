import { useCallback, useEffect, useMemo, useState } from "react";
import { CommsAgentClient } from "./client.js";
import {
  ensureFreshChatSessionToken,
  getChatSessionToken,
  mintChatSessionToken,
  setChatSessionToken,
  subscribeChatSessionToken,
} from "./chatSessionToken.js";
import {
  loadCommsAgentConfig,
  refreshCommsConfigCache,
  saveCommsAgentConfigSecure,
} from "./storage.js";
import type { CommsAgentConfig } from "./types.js";
import { usesSupabaseHostedAuth } from "../hostConfig.js";
import { fetchHostedAgentConnection } from "../auth/hostedAccount.js";

const SESSION_KEEPALIVE_MS = 60_000;

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
        try {
          const connection = await fetchHostedAgentConnection();
          await saveCommsAgentConfigSecure({
            adminUrl: connection.adminUrl,
            adminToken: connection.adminToken,
          });
          if (connection.sessionToken?.trim()) {
            minted = connection.sessionToken.trim();
          } else {
            minted = await mintChatSessionToken(await refreshCommsConfigCache());
          }
        } catch (error) {
          console.warn(
            `[agent-config] hosted reconnect failed: ${error instanceof Error ? error.message : String(error)}`,
          );
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

  useEffect(() => {
    return subscribeChatSessionToken((token) => {
      setSessionToken(token);
      setSessionReady(Boolean(token || loadCommsAgentConfig().adminToken?.trim()));
    });
  }, []);

  useEffect(() => {
    if (!vaultUnlocked) return;
    let cancelled = false;
    const tick = async () => {
      const next = await refreshCommsConfigCache();
      const canMint = Boolean(next.adminToken?.trim()) || usesSupabaseHostedAuth();
      if (!canMint || cancelled) return;
      const fresh = await ensureFreshChatSessionToken(next);
      if (cancelled || !fresh) return;
      setConfig(next);
      setSessionToken(fresh);
      setSessionReady(true);
    };
    void tick();
    const timer = window.setInterval(() => void tick(), SESSION_KEEPALIVE_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [vaultUnlocked]);

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
