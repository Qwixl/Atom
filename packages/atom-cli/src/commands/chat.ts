import { randomUUID } from "node:crypto";
import { collectPositional } from "../args.js";
import { adminFetch, loadAgentConnection } from "../connection.js";

export async function chatWithAgent(args: string[]): Promise<void> {
  const prompt = collectPositional(args).join(" ").trim();
  if (!prompt) {
    console.error('Usage: atom chat "your message"');
    process.exit(1);
  }

  const connection = await loadAgentConnection();
  const threadId = randomUUID();
  const runId = randomUUID();
  const response = await adminFetch(connection, "/agent", {
    method: "POST",
    body: JSON.stringify({
      threadId,
      runId,
      messages: [{ role: "user", content: prompt }],
      tools: [],
      context: [],
      state: {},
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${text || response.statusText}`);
  }

  const body = response.body;
  if (!body) throw new Error("No response body from agent chat endpoint.");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6)) as { type?: string; delta?: string; message?: string };
        if (event.type === "TEXT_MESSAGE_CONTENT" && event.delta) text += event.delta;
        if (event.type === "RUN_ERROR") throw new Error(event.message ?? "Agent chat failed.");
      } catch (error) {
        if (error instanceof SyntaxError) continue;
        throw error;
      }
    }
  }

  if (!text.trim()) {
    console.log("(No text response — is LLM_API_KEY set on your agent?)");
    return;
  }
  console.log(text.trim());
}
