import { EventType, type BaseEvent, type RunAgentInput } from "@ag-ui/client";

export type AgUiEventSource =
  | AsyncGenerator<BaseEvent>
  | Generator<BaseEvent>
  | (() => AsyncGenerator<BaseEvent> | Generator<BaseEvent>);

async function* iterateEvents(source: AgUiEventSource): AsyncGenerator<BaseEvent> {
  const events = typeof source === "function" ? source() : source;
  yield* events;
}

/** Write AG-UI SSE frames for a run (RUN_STARTED → events → RUN_FINISHED | RUN_ERROR). */
export function writeAgUiSseStream(
  write: (chunk: string) => void,
  input: RunAgentInput,
  source: AgUiEventSource,
): Promise<void> {
  const { threadId, runId } = input;
  write(`data: ${JSON.stringify({ type: EventType.RUN_STARTED, threadId, runId })}\n\n`);
  return (async () => {
    try {
      for await (const event of iterateEvents(source)) {
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
