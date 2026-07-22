import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ConsequentialAction } from "@qwixl/shell-core";
import { resolveAgentDeliveryBase } from "../comms/agentDeliveryUrl.js";
import { DemoPairView } from "../DemoPairView.js";
import { AtomShell } from "../shell/AtomShell.js";
import { DemoInstructionsModal } from "./DemoInstructionsModal.js";
import {
  clearDemoSession,
  isDemoSessionActive,
  loadDemoSessionConfig,
  loadDemoSessionDeliveryUrl,
  loadDemoSessionPeerConfig,
} from "./demoSessionStorage.js";
import { DEMO_PEER_TOKEN, demoPeerAdminUrl } from "../marketing/demoPeerConnect.js";

export function DemoSessionApp() {
  const aliceConfig = useMemo(() => loadDemoSessionConfig(), []);
  const aliceDelivery = useMemo(
    () => loadDemoSessionDeliveryUrl() ?? resolveAgentDeliveryBase(aliceConfig?.adminUrl ?? ""),
    [aliceConfig?.adminUrl],
  );
  const bobConfig = useMemo(
    () =>
      loadDemoSessionPeerConfig() ?? {
        adminUrl: demoPeerAdminUrl(),
        adminToken: DEMO_PEER_TOKEN,
      },
    [],
  );
  const instructionsRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!isDemoSessionActive() || !aliceConfig?.adminUrl) {
      window.location.replace("/app/?demo=1");
    }
  }, [aliceConfig?.adminUrl]);

  const exitDemo = useCallback(() => {
    clearDemoSession();
    window.location.href = "/demo/";
  }, []);

  async function requestCommsConfirmation(_action: ConsequentialAction) {
    return {
      decision: "approved" as const,
      attestationRef: crypto.randomUUID(),
      approvalRef: crypto.randomUUID(),
    };
  }

  if (!aliceConfig?.adminUrl || !bobConfig?.adminUrl) return null;

  return (
    <>
      <AtomShell
        variant="demo"
        showDemoTag
        section="comms"
        onNavigate={() => {}}
        onOpenSettings={exitDemo}
        onOpenAccount={exitDemo}
        settingsLabel="Exit demo"
        badges={{}}
        headerActions={
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => instructionsRef.current?.showModal()}
          >
            Instructions
          </button>
        }
        lockedSections={[
          "home",
          "none",
          "tasks",
          "calendar",
          "memory",
          "tools",
          "agents",
          "marketplace",
          "discover",
          "rooms",
          "profile",
          "log",
          "board",
        ]}
      >
        <div className="demo-session-frame">
          <DemoPairView
            showIntro={false}
            alice={{
              label: "Alice",
              adminUrl: aliceConfig.adminUrl,
              adminToken: aliceConfig.adminToken ?? "",
              deliveryBase: aliceDelivery,
            }}
            bob={{
              label: "Bob",
              adminUrl: bobConfig.adminUrl,
              adminToken: bobConfig.adminToken ?? "",
              deliveryBase: bobConfig.adminUrl,
            }}
            onRequestConfirmation={requestCommsConfirmation}
          />
        </div>
      </AtomShell>

      <DemoInstructionsModal ref={instructionsRef} />
    </>
  );
}
