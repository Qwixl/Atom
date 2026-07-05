import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Catalog, ModuleRegistry } from "@qwixl/shell-core";

import { createModuleBridge, MODULE_IFRAME_SANDBOX } from "@qwixl/renderer-web";

import { CommsAgentClient } from "../comms/client.js";

import { loadCommsAgentConfig } from "../comms/storage.js";



export const WEBCAL_CONNECTOR_MODULE_ID = "connectors/webcal";



function resolveBundleUrl(bundleUrl: string): string {

  if (/^https?:\/\//i.test(bundleUrl)) return bundleUrl;

  return new URL(bundleUrl, window.location.origin).href;

}



interface ConnectorModuleHostProps {

  moduleId: string;

  catalog: Catalog;

  registry: ModuleRegistry;

  modulesEnabled: boolean;

}



interface WebcalFeedSummary {

  id: string;

  label: string;

}



interface ConnectorModuleState {

  label: string;

  connected: boolean;

  busy: boolean;

  note: string;

  feeds: WebcalFeedSummary[];

  events: Array<{ uid?: string; summary?: string; start?: string; end?: string }>;

}



export function ConnectorModuleHost({

  moduleId,

  catalog,

  registry,

  modulesEnabled,

}: ConnectorModuleHostProps) {

  const config = loadCommsAgentConfig();

  const client = useMemo(

    () => new CommsAgentClient(config.adminUrl, config.adminToken),

    [config.adminToken, config.adminUrl],

  );

  const [ready, setReady] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [moduleProps, setModuleProps] = useState<ConnectorModuleState>({

    label: "WebCal",

    connected: false,

    busy: false,

    note: "",

    feeds: [],

    events: [],

  });

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const propsRef = useRef(moduleProps);

  propsRef.current = moduleProps;



  const manifest = catalog.getModuleManifest(moduleId);

  const agentConnectorId = manifest?.connector?.agentId ?? "webcal";

  const bundlePath = catalog.getModuleBundle(moduleId);

  const bundleUrl = bundlePath ? resolveBundleUrl(bundlePath) : null;

  const bridge = useMemo(

    () => (bundlePath ? createModuleBridge(bundlePath) : null),

    [bundlePath],

  );



  const pushInit = useCallback(() => {

    const win = iframeRef.current?.contentWindow;

    if (!win || !bridge) return;

    bridge.sendInit(win, { ...propsRef.current });

  }, [bridge]);



  const refreshStatus = useCallback(async () => {

    setModuleProps((prev) => ({ ...prev, busy: true, note: "" }));

    try {

      const status = await client.connectorStatus(agentConnectorId);

      const statusOp = await client.invokeConnector(agentConnectorId, "getStatus", {});

      const statusResult = statusOp.result as {

        connected?: boolean;

        feeds?: WebcalFeedSummary[];

      };

      const connected = Boolean(statusResult.connected ?? status.configured);

      const feeds = statusResult.feeds ?? [];

      let events: ConnectorModuleState["events"] = [];

      if (connected) {

        const now = new Date();

        const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const listed = await client.invokeConnector(agentConnectorId, "listEvents", {

          timeMin: now.toISOString(),

          timeMax: week.toISOString(),

        });

        events = (listed.result as { events?: ConnectorModuleState["events"] }).events ?? [];

      }

      setModuleProps((prev) => ({

        ...prev,

        label: status.label ?? manifest?.connector?.label ?? prev.label,

        connected,

        feeds,

        events,

        busy: false,

        note: "",

      }));

    } catch (error) {

      setModuleProps((prev) => ({

        ...prev,

        busy: false,

        note: error instanceof Error ? error.message : String(error),

      }));

    }

  }, [agentConnectorId, client, manifest?.connector?.label]);



  useEffect(() => {

    if (!modulesEnabled) {

      setLoadError("Enable modules in the shell header to load connector settings.");

      setReady(false);

      return;

    }

    let cancelled = false;

    setLoadError(null);

    void registry

      .ensureModule(catalog, moduleId)

      .then(() => {

        if (!cancelled) setReady(true);

      })

      .catch((error) => {

        if (!cancelled) {

          setLoadError(error instanceof Error ? error.message : String(error));

          setReady(false);

        }

      });

    return () => {

      cancelled = true;

    };

  }, [catalog, moduleId, modulesEnabled, registry]);



  useEffect(() => {

    if (ready) void refreshStatus();

  }, [ready, refreshStatus]);



  useEffect(() => {

    pushInit();

  }, [moduleProps, pushInit]);



  useEffect(() => {

    if (!bridge) return;

    const activeBridge = bridge;

    function onMessage(event: MessageEvent): void {

      if (event.source !== iframeRef.current?.contentWindow) return;

      if (!activeBridge.isAllowedMessageOrigin(event.origin)) return;

      const data = event.data as {

        type?: string;

        name?: string;

        payload?: { url?: string; label?: string; feedId?: string };

      } | null;

      if (!data || typeof data !== "object") return;

      if (data.type === "ready") {

        pushInit();

        return;

      }

      if (data.type !== "event" || typeof data.name !== "string") return;

      if (data.name === "refreshRequested") {

        void refreshStatus();

        return;

      }

      if (data.name === "setFeedRequested") {

        const url = data.payload?.url?.trim();

        if (!url) return;

        void (async () => {

          setModuleProps((prev) => ({ ...prev, busy: true, note: "Saving feed URL to agent vault…" }));

          try {

            await client.addWebcalFeed(url, data.payload?.label);

            await refreshStatus();

          } catch (error) {

            setModuleProps((prev) => ({

              ...prev,

              busy: false,

              note: error instanceof Error ? error.message : String(error),

            }));

          }

        })();

        return;

      }

      if (data.name === "removeFeedRequested") {

        const feedId = data.payload?.feedId?.trim();

        if (!feedId) return;

        void (async () => {

          setModuleProps((prev) => ({ ...prev, busy: true, note: "Removing feed…" }));

          try {

            await client.removeWebcalFeed(feedId);

            await refreshStatus();

          } catch (error) {

            setModuleProps((prev) => ({

              ...prev,

              busy: false,

              note: error instanceof Error ? error.message : String(error),

            }));

          }

        })();

      }

    }

    window.addEventListener("message", onMessage);

    return () => window.removeEventListener("message", onMessage);

  }, [bridge, client, pushInit, refreshStatus]);



  if (loadError) {

    return (

      <section className="settings-section">

        <p className="settings-note">{loadError}</p>

      </section>

    );

  }



  if (!ready || !bundleUrl || !bridge) {

    return (

      <section className="settings-section">

        <p className="settings-note">Loading connector module…</p>

      </section>

    );

  }



  return (

    <section className="settings-section settings-connector-module">

      <iframe

        ref={iframeRef}

        className="atom-module-frame settings-connector-frame"

        src={bundleUrl}

        sandbox={MODULE_IFRAME_SANDBOX}

        title={manifest?.connector?.label ?? "Connector"}

        onLoad={pushInit}

      />

    </section>

  );

}


