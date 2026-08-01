/**
 * MCP Apps host frame (D131 / MCPA-02).
 * Renders third-party ui:// HTML in a sandboxed iframe with a JSON-RPC bridge.
 * Not the registry ModuleFrameView path.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  classifyMcpAppBridgeRequest,
  classifyPermissionRequest,
  quarantineMcpAppChatMessage,
  type McpAppBridgeDecision,
} from "@qwixl/shell-core";

export interface McpAppHostProps {
  serverId: string;
  serverLabel: string;
  uri: string;
  /** HTML already wrapped with host CSP. */
  htmlWithCsp: string;
  contentHash: string;
  stale?: boolean;
  allowedTools: readonly string[];
  safeTools: readonly string[];
  pinnedUris: readonly string[];
  /** Tools with `_meta.ui.visibility` including `"app"` (default both). */
  appVisibleTools?: readonly string[];
  onProxyTool?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  onProxyResource?: (uri: string) => Promise<unknown>;
  onApprovedChatMessage?: (quarantinedText: string) => void;
  onLog?: (message: string) => void;
}

type PendingChrome =
  | { kind: "tool"; toolName: string; args: Record<string, unknown>; resolve: (v: unknown) => void; reject: (e: Error) => void }
  | { kind: "message"; text: string; resolve: () => void; reject: (e: Error) => void }
  | { kind: "permission"; permission: string; resolve: () => void; reject: (e: Error) => void };

const SANDBOX = "allow-scripts";

export function McpAppHost(props: McpAppHostProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [pending, setPending] = useState<PendingChrome | null>(null);
  const [height, setHeight] = useState(320);
  const grantedRef = useRef(new Set<string>());
  const pendingRef = useRef<PendingChrome | null>(null);
  const msgWindowRef = useRef<{ t: number; n: number }>({ t: 0, n: 0 });
  pendingRef.current = pending;

  const respond = useCallback((id: string | number | null, result: unknown, error?: { code: number; message: string }) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const payload = error
      ? { jsonrpc: "2.0", id, error }
      : { jsonrpc: "2.0", id, result };
    win.postMessage(payload, "*");
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const now = Date.now();
      if (now - msgWindowRef.current.t >= 1000) {
        msgWindowRef.current = { t: now, n: 0 };
      }
      msgWindowRef.current.n += 1;
      if (msgWindowRef.current.n > 60) {
        props.onLog?.("MCP App postMessage rate exceeded (60/s) — dropping");
        return;
      }
      const data = event.data;
      if (!data || typeof data !== "object") return;
      const msg = data as { jsonrpc?: string; id?: string | number | null; method?: string; params?: unknown };
      if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return;

      const decision = classifyMcpAppBridgeRequest(msg.method, msg.params, {
        serverId: props.serverId,
        allowedTools: props.allowedTools,
        safeTools: props.safeTools,
        pinnedUris: new Set(props.pinnedUris),
        grantedPermissions: grantedRef.current,
        staleDisplayOnly: props.stale === true,
        appVisibleTools: props.appVisibleTools,
      });

      void handleDecision(msg.id ?? null, decision);
    };

    async function handleDecision(id: string | number | null, decision: McpAppBridgeDecision) {
      switch (decision.action) {
        case "reject":
          respond(id, null, { code: -32601, message: decision.reason });
          return;
        case "allow":
          respond(id, {});
          return;
        case "log":
          props.onLog?.(decision.message);
          respond(id, {});
          return;
        case "resize":
          if (typeof decision.height === "number" && Number.isFinite(decision.height)) {
            setHeight(Math.min(960, Math.max(120, decision.height)));
          }
          respond(id, {});
          return;
        case "proxy-tool":
          try {
            const result = await props.onProxyTool?.(decision.toolName, decision.args);
            respond(id, result ?? {});
          } catch (error) {
            respond(id, null, {
              code: -32000,
              message: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        case "proxy-resource":
          try {
            const result = await props.onProxyResource?.(decision.uri);
            respond(id, result ?? {});
          } catch (error) {
            respond(id, null, {
              code: -32000,
              message: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        case "confirm-tool":
          await new Promise<void>((resolve, reject) => {
            setPending({
              kind: "tool",
              toolName: decision.toolName,
              args: decision.args,
              resolve: (value) => {
                respond(id, value);
                resolve();
              },
              reject: (error) => {
                respond(id, null, { code: -32000, message: error.message });
                reject(error);
              },
            });
          }).catch(() => undefined);
          return;
        case "confirm-message":
          await new Promise<void>((resolve, reject) => {
            setPending({
              kind: "message",
              text: decision.text,
              resolve: () => {
                props.onApprovedChatMessage?.(
                  quarantineMcpAppChatMessage(decision.text, props.serverId),
                );
                respond(id, {});
                resolve();
              },
              reject: (error) => {
                respond(id, null, { code: -32000, message: error.message });
                reject(error);
              },
            });
          }).catch(() => undefined);
          return;
        default:
          respond(id, null, { code: -32601, message: "Unhandled" });
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [props, respond]);

  // Permission requests arrive as tools/call-like or future ui/request-permission —
  // expose a helper via chrome for SEP permissions metadata on init.
  const requestPermission = (permission: string) => {
    const decision = classifyPermissionRequest(permission, grantedRef.current);
    if (decision.action === "allow") return;
    if (decision.action === "confirm-permission") {
      setPending({
        kind: "permission",
        permission: decision.permission,
        resolve: () => {
          grantedRef.current.add(decision.permission);
        },
        reject: () => undefined,
      });
    }
  };
  void requestPermission;

  return (
    <div className="mcp-app-host" data-server={props.serverId} data-uri={props.uri}>
      <div className="mcp-app-host__chrome" role="group" aria-label="MCP App provenance">
        <strong>{props.serverLabel}</strong>
        <span>{props.uri}</span>
        {props.stale ? <span className="mcp-app-host__stale">Stale — display only</span> : null}
        <span className="mcp-app-host__hash" title={props.contentHash}>
          {props.contentHash.slice(0, 8)}
        </span>
      </div>
      <iframe
        ref={iframeRef}
        title={`MCP App ${props.uri}`}
        sandbox={SANDBOX}
        srcDoc={props.htmlWithCsp}
        style={{ width: "100%", height, border: "1px solid var(--atom-border, #ccc)" }}
      />
      {pending ? (
        <div className="mcp-app-host__confirm" role="dialog" aria-modal="true">
          {pending.kind === "tool" ? (
            <>
              <p>
                Allow tool <code>{pending.toolName}</code> from {props.serverLabel}?
              </p>
              <pre>{JSON.stringify(pending.args, null, 2)}</pre>
              <button
                type="button"
                onClick={() => {
                  const current = pendingRef.current;
                  setPending(null);
                  void props.onProxyTool?.(pending.toolName, pending.args).then(
                    (value) => current?.kind === "tool" && current.resolve(value),
                    (error) =>
                      current?.kind === "tool" &&
                      current.reject(error instanceof Error ? error : new Error(String(error))),
                  );
                }}
              >
                Allow
              </button>
              <button
                type="button"
                onClick={() => {
                  pending.reject(new Error("Owner denied tool call"));
                  setPending(null);
                }}
              >
                Deny
              </button>
            </>
          ) : null}
          {pending.kind === "message" ? (
            <>
              <p>Insert this text from {props.serverLabel} into chat?</p>
              <pre>{pending.text}</pre>
              <button
                type="button"
                onClick={() => {
                  pending.resolve();
                  setPending(null);
                }}
              >
                Insert
              </button>
              <button
                type="button"
                onClick={() => {
                  pending.reject(new Error("Owner denied message"));
                  setPending(null);
                }}
              >
                Deny
              </button>
            </>
          ) : null}
          {pending.kind === "permission" ? (
            <>
              <p>
                Allow <code>{pending.permission}</code> for {props.serverLabel}?
              </p>
              <button
                type="button"
                onClick={() => {
                  pending.resolve();
                  setPending(null);
                }}
              >
                Allow
              </button>
              <button
                type="button"
                onClick={() => {
                  pending.reject(new Error("Owner denied permission"));
                  setPending(null);
                }}
              >
                Deny
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
