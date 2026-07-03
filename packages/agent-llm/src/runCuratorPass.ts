import type { LlmConfig } from "./LlmAgentSession.js";
import {
  buildCuratorPrompt,
  parseCuratorResponse,
  type CuratorPassInput,
  type CuratorPassResult,
  type CuratorSignal,
  type CuratorSignalKind,
} from "./curator.js";

export type { CuratorPassInput, CuratorPassResult, CuratorSignal, CuratorSignalKind };
export { buildCuratorPrompt, parseCuratorResponse, defaultGuardForCategory } from "./curator.js";

/**
 * Background extraction pass over a completed turn. Proposals and evidence
 * signals never reach the user directly — owner store applies them.
 */
export async function runCuratorPass(
  config: LlmConfig,
  input: CuratorPassInput,
): Promise<CuratorPassResult> {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: buildCuratorPrompt(input) },
        { role: "user", content: "Extract proposals from the transcript above." },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Curator pass failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  return parseCuratorResponse(content);
}