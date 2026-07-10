import type { ConnectorVault } from "./connectorVault.js";
import type { AtomToolExecutor } from "@qwixl/agent-llm";

/** Read-only connector executor for chat / brain turns (writes blocked). */
export function createReadOnlyConnectorExecutor(vault: ConnectorVault): AtomToolExecutor {
  return async (call) => {
    const { getConnectorBackend } = await import("./connectorRegistry.js");
    const { invokeConnectorCached } = await import("./connectorInvoke.js");
    const backend = getConnectorBackend(call.connectorId);
    if (!backend) {
      throw new Error(`Unknown connector "${call.connectorId}"`);
    }
    const operationSpec = backend.operationSpec?.(call.operation);
    if (operationSpec?.permission === "write") {
      throw new Error(
        `Connector write "${call.connectorId}/${call.operation}" is not allowed from chat`,
      );
    }
    const invoked = await invokeConnectorCached(
      backend,
      vault,
      call.connectorId,
      call.operation,
      call.input ?? {},
      operationSpec,
    );
    return invoked.result;
  };
}
