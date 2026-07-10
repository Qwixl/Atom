import { presentChatAgentError } from "@qwixl/shell-core";

/** Detect Responses API failures that can fall back to Chat Completions. */
export function isResponsesApiFallbackEligible(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /Responses API (403|404|401)/i.test(message) ||
    /Verify Organization|organization must be verified/i.test(message) ||
    /does not have access to model|model_not_found/i.test(message)
  );
}

/** User-facing provider error text — never pass raw API/JSON blobs to owners. */
export function formatLlmProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Verify Organization|organization must be verified/i.test(message)) {
    return (
      "Your OpenAI organization must be verified to use hosted tools (web search, code interpreter) with this model. " +
      "Verify at https://platform.openai.com/settings/organization/general — or switch to another model in Settings → Agent. " +
      "Atom can still chat via Chat Completions when verification is pending."
    );
  }
  return presentChatAgentError(error);
}
