import type { ConnectorVault } from "./connectorVault.js";
import {
  WEBCAL_CONNECTOR_ID,
  WEBCAL_CONNECTOR_OPERATIONS,
  invokeWebcalConnector,
} from "./webcalConnector.js";

/** Pluggable connector module (M9/M13.5 v1: WebCal only). */
export interface ConnectorBackend {
  readonly id: string;
  readonly moduleId: string;
  readonly provider: string;
  readonly label: string;
  status(vault: ConnectorVault): Promise<Record<string, unknown>>;
  invoke(
    vault: ConnectorVault,
    operation: string,
    input: Record<string, unknown>,
  ): Promise<unknown>;
}

const webcalBackend: ConnectorBackend = {
  id: WEBCAL_CONNECTOR_ID,
  moduleId: "connectors/webcal",
  provider: "webcal",
  label: "WebCal",
  async status(vault) {
    const feeds = vault.getWebcalFeeds();
    return {
      connectorId: WEBCAL_CONNECTOR_ID,
      moduleId: "connectors/webcal",
      provider: "webcal",
      label: "WebCal",
      configured: feeds.length > 0,
      feedCount: feeds.length,
      feeds: feeds.map((feed) => ({ id: feed.id, label: feed.label })),
      vaultOnly: true,
      operations: WEBCAL_CONNECTOR_OPERATIONS,
    };
  },
  async invoke(vault, operation, input) {
    return invokeWebcalConnector({ vault }, operation, input);
  },
};

/** Registered connector backends. Add Google Calendar, etc. here without changing route shapes. */
const CONNECTOR_BACKENDS = new Map<string, ConnectorBackend>([[WEBCAL_CONNECTOR_ID, webcalBackend]]);

export function getConnectorBackend(connectorId: string): ConnectorBackend | undefined {
  return CONNECTOR_BACKENDS.get(connectorId.trim());
}

export function listConnectorBackendIds(): string[] {
  return [...CONNECTOR_BACKENDS.keys()];
}
