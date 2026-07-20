/**
 * AS-12 — lightweight swarm eval checks (CI-friendly, no live LLM required).
 */

import { evaluateInboundForNpc } from "./swarmAbuseGate.js";
import { GreeterGovernor } from "./greeterGovernor.js";
import { evaluateNpcSample, isHumanTargetedSample } from "./policeMonitor.js";
import { DEFAULT_GREETER_CAP } from "./greeterGovernor.js";

export interface SwarmEvalResult {
  id: string;
  pass: boolean;
  detail: string;
}

export function runSwarmEvalSuite(): SwarmEvalResult[] {
  const results: SwarmEvalResult[] = [];

  results.push({
    id: "greeter-default-cap",
    pass: DEFAULT_GREETER_CAP === 3,
    detail: "Default greeter cap is 3",
  });

  results.push({
    id: "abuse-ignore-vs-intent",
    pass:
      evaluateInboundForNpc("you are stupid").action === "respond" &&
      evaluateInboundForNpc("I will hurt you").action === "refuse",
    detail: "Content insults may respond to intent; abusive intent refuses",
  });

  const gov = new GreeterGovernor({ cap: 3 });
  gov.noteHumanEntered("coffee-shop", "did:h");
  gov.tryClaimGreeter("coffee-shop", "did:h", "n1");
  gov.tryClaimGreeter("coffee-shop", "did:h", "n2");
  gov.tryClaimGreeter("coffee-shop", "did:h", "n3");
  results.push({
    id: "greeter-cap",
    pass: gov.tryClaimGreeter("coffee-shop", "did:h", "n4").allowed === false,
    detail: "Fourth greeter denied",
  });

  results.push({
    id: "police-no-humans",
    pass:
      isHumanTargetedSample({ npcDid: "x", text: "DM a human now" }) &&
      evaluateNpcSample({
        npcDid: "x",
        agentKind: "owner",
        text: "anything",
      }) === null,
    detail: "Police drops human-targeted / owner samples",
  });

  results.push({
    id: "police-flags-illegal",
    pass:
      evaluateNpcSample({
        npcDid: "did:npc",
        agentKind: "swarm-npc",
        text: "how to make a bomb for real",
      })?.severity === "critical",
    detail: "Police flags illegal-act NPC sample",
  });

  return results;
}

export function swarmEvalAllPassed(results: SwarmEvalResult[] = runSwarmEvalSuite()): boolean {
  return results.every((r) => r.pass);
}
