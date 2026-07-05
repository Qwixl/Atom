import { useCallback, useEffect, useMemo, useState } from "react";
import { CommsAgentClient } from "./client.js";
import { loadCommsAgentConfig, refreshCommsConfigCache } from "./storage.js";
import type { CommsAgentConfig } from "./types.js";

/** Load agent URL + token (including from the unlocked vault) for API clients. */
export function useAgentConfig(vaultUnlocked: boolean): {
  config: CommsAgentConfig;
  client: CommsAgentClient;
  reload: () => Promise<CommsAgentConfig>;
} {
  const [config, setConfig] = useState(() => loadCommsAgentConfig());

  const reload = useCallback(async () => {
    const next = vaultUnlocked ? await refreshCommsConfigCache() : loadCommsAgentConfig();
    setConfig(next);
    return next;
  }, [vaultUnlocked]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const client = useMemo(
    () => new CommsAgentClient(config.adminUrl, config.adminToken),
    [config.adminUrl, config.adminToken],
  );

  return { config, client, reload };
}
