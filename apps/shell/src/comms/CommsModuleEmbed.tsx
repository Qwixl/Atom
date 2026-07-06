import { useEffect, useMemo, useRef, useState } from "react";
import type { Catalog, ModuleRegistry } from "@qwixl/shell-core";
import { createModuleBridge, MODULE_IFRAME_SANDBOX } from "@qwixl/renderer-web";

function resolveBundleUrl(bundleUrl: string): string {
  if (/^https?:\/\//i.test(bundleUrl)) return bundleUrl;
  const base = import.meta.env.BASE_URL ?? "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  return new URL(bundleUrl.replace(/^\//, ""), `${window.location.origin}${root}`).href;
}

export function CommsModuleEmbed({
  moduleId,
  catalog,
  registry,
  props,
  className,
  minHeight = 120,
  onEvent,
}: {
  moduleId: string;
  catalog: Catalog;
  registry: ModuleRegistry;
  props: Record<string, unknown>;
  className?: string;
  minHeight?: number;
  onEvent?: (name: string, payload: Record<string, unknown>) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const manifest = catalog.getModuleManifest(moduleId);
  const bundleUrl = manifest ? catalog.getModuleBundle(moduleId) : undefined;

  const bridge = useMemo(
    () => (bundleUrl ? createModuleBridge(resolveBundleUrl(bundleUrl)) : null),
    [bundleUrl],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setReady(false);
    void registry
      .ensureModule(catalog, moduleId)
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [catalog, moduleId, registry]);

  useEffect(() => {
    if (!ready || !bridge) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    bridge.sendInit(win, propsRef.current);
  }, [bridge, props, ready]);

  useEffect(() => {
    if (!bridge) return;
    const handler = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!bridge.isAllowedMessageOrigin(event.origin)) return;
      const data = event.data as { type?: string; name?: string; payload?: Record<string, unknown> };
      if (data?.type === "ready") {
        const win = iframeRef.current?.contentWindow;
        if (win) bridge.sendInit(win, propsRef.current);
        return;
      }
      if (data?.type === "event" && typeof data.name === "string") {
        onEventRef.current?.(data.name, data.payload ?? {});
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [bridge]);

  if (loadError) {
    return <p className="comms-module-error">{loadError}</p>;
  }
  if (!manifest || !bundleUrl || !bridge) {
    return <p className="comms-module-error">Module not loaded.</p>;
  }

  return (
    <iframe
      ref={iframeRef}
      className={className ?? "comms-module-iframe"}
      title={manifest.id}
      src={resolveBundleUrl(bundleUrl)}
      sandbox={MODULE_IFRAME_SANDBOX}
      style={{ minHeight, width: "100%", border: "none", display: "block" }}
    />
  );
}
