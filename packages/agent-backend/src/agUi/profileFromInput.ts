import type { RunAgentInput } from "@ag-ui/client";
import type { PromptProfile } from "@qwixl/agent-llm";
import { ATOM_AGUI_PROFILE_PROP } from "@qwixl/owner-store";

export function profileFromRunAgentInput(
  input: RunAgentInput,
  fallback?: PromptProfile,
): PromptProfile | undefined {
  const forwarded = input.forwardedProps as Record<string, unknown> | undefined;
  const fromShell = forwarded?.[ATOM_AGUI_PROFILE_PROP];
  if (fromShell && typeof fromShell === "object" && fromShell !== null) {
    return fromShell as PromptProfile;
  }
  return fallback;
}
