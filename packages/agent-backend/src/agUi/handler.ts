import { type BaseEvent, type RunAgentInput } from "@ag-ui/client";
import { writeAgUiSseStream, type AgUiEventSource } from "@qwixl/ag-ui-adapter/server";
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
    "You need to add an API key for your language model (OpenAI, Anthropic, Google, etc.). Open Settings → Agent, paste your key, and save — then try again.",
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
  const source: AgUiEventSource = () => runAgUiHandler(input, options);
  return writeAgUiSseStream(write, input, source);
}
