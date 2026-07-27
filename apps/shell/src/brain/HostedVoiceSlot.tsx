import { useEffect, useRef } from "react";
import { loadCommsAgentConfigSecure } from "../comms/storage.js";
import { CONTROL_PLANE_URL } from "../hostConfig.js";

/**
 * Connector slot for Atom-MC hosted human-voice (Talk).
 * Self-host / OSS clones: /hosted-voice/talk.js is absent → renders nothing.
 * atom.qwixl.com: Mission Control ships the module; this shell never imports vendor SDKs.
 */
export function HostedVoiceSlot({ enabled }: { enabled: boolean }) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled || !rootRef.current) return;
    const el = rootRef.current;
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const modUrl = new URL("/hosted-voice/talk.js", window.location.origin).href;
        const mod = (await import(/* @vite-ignore */ modUrl)) as {
          mountTalkButton?: (
            host: HTMLElement,
            opts: {
              controlPlaneUrl: string;
              getAdminToken: () => Promise<string | null>;
            },
          ) => () => void;
        };
        if (cancelled || !mod.mountTalkButton) return;
        const cp = CONTROL_PLANE_URL.replace(/\/$/, "");
        if (!cp) return;
        cleanup = mod.mountTalkButton(el, {
          controlPlaneUrl: cp,
          getAdminToken: async () => {
            const cfg = await loadCommsAgentConfigSecure();
            return cfg.adminToken?.trim() || null;
          },
        });
      } catch {
        /* no hosted module on this origin */
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
      el.replaceChildren();
    };
  }, [enabled]);

  if (!enabled) return null;
  return <div className="voice-hosted-slot" ref={rootRef} />;
}
