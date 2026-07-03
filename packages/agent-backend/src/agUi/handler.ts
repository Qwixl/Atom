import { EventType, type BaseEvent, type RunAgentInput } from "@ag-ui/client";
import { loadLlmAgUiConfigFromEnv, runLlmAgUiEvents } from "./llmRunner.js";
import { textAgUiEvents } from "./outputEvents.js";
import { v4 as uuid } from "uuid";

export type AgUiScenarioHandler = (input: RunAgentInput) => Generator<BaseEvent> | AsyncGenerator<BaseEvent>;

export async function* runAgUiHandler(
  input: RunAgentInput,
  options: {
    llmConfig?: ReturnType<typeof loadLlmAgUiConfigFromEnv>;
    scenario?: AgUiScenarioHandler;
  } = {},
): AsyncGenerator<BaseEvent> {
  const llmConfig = options.llmConfig ?? loadLlmAgUiConfigFromEnv();
  if (llmConfig) {
    yield* runLlmAgUiEvents(input, llmConfig);
    return;
  }
  if (options.scenario) {
    yield* options.scenario(input);
    return;
  }
  yield* textAgUiEvents(
    uuid(),
    "AG-UI LLM not configured. Set LLM_API_KEY (or OPENAI_API_KEY) on the agent backend, or use the reference scenario server (pnpm dev:ag-ui).",
  );
}

export function writeAgUiSse(
  write: (chunk: string) => void,
  input: RunAgentInput,
  options: {
    llmConfig?: ReturnType<typeof loadLlmAgUiConfigFromEnv>;
    scenario?: AgUiScenarioHandler;
  } = {},
): Promise<void> {
  const { threadId, runId } = input;
  write(`data: ${JSON.stringify({ type: EventType.RUN_STARTED, threadId, runId })}\n\n`);
  return (async () => {
    try {
      for await (const event of runAgUiHandler(input, options)) {
        write(`data: ${JSON.stringify(event)}\n\n`);
      }
      write(`data: ${JSON.stringify({ type: EventType.RUN_FINISHED, threadId, runId })}\n\n`);
    } catch (error) {
      write(
        `data: ${JSON.stringify({
          type: EventType.RUN_ERROR,
          threadId,
          runId,
          message: error instanceof Error ? error.message : String(error),
        })}\n\n`,
      );
    }
  })();
}
