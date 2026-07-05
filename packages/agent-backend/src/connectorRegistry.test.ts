import { describe, expect, it } from "vitest";
import { getConnectorBackend, listConnectorBackendIds } from "./connectorRegistry.js";
import { WEBCAL_CONNECTOR_ID } from "./webcalConnector.js";

describe("connectorRegistry", () => {
  it("registers WebCal backend", () => {
    expect(listConnectorBackendIds()).toContain(WEBCAL_CONNECTOR_ID);
    expect(getConnectorBackend(WEBCAL_CONNECTOR_ID)?.provider).toBe("webcal");
  });

  it("returns undefined for unknown connector", () => {
    expect(getConnectorBackend("connectors/unknown")).toBeUndefined();
  });
});
