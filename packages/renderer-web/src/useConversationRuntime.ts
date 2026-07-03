import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  ConversationRuntime,
  type AgentSession,
  type ConversationRuntimeOptions,
  type ConversationSnapshot,
} from "@atom/shell-core";

export interface UseConversationRuntimeResult {
  runtime: ConversationRuntime;
  snapshot: ConversationSnapshot;
  feed: ConversationSnapshot["feed"];
  busy: boolean;
  pending: ConversationSnapshot["pending"];
}

/**
 * React binding for {@link ConversationRuntime}. Subscribes to feed/busy/pending
 * and wires {@link AgentSession} when session is provided.
 */
export function useConversationRuntime(
  options: ConversationRuntimeOptions,
  session?: AgentSession | null,
): UseConversationRuntimeResult {
  const runtime = useMemo(() => new ConversationRuntime(options), [options]);

  const snapshot = useSyncExternalStore(
    (listener) => runtime.subscribe(listener),
    () => runtime.getSnapshot(),
  );

  useEffect(() => {
    if (!session) return;
    return runtime.wireSession(session);
  }, [runtime, session]);

  return {
    runtime,
    snapshot,
    feed: snapshot.feed,
    busy: snapshot.busy,
    pending: snapshot.pending,
  };
}
