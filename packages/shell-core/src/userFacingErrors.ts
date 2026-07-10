/** Owner-facing chat/agent error copy. Packages always sanitize (no account context). */

const GENERIC = "Something went wrong talking to your agent. Try again.";

function rawMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Map agent/chat failures to short, non-technical messages. */
export function presentChatAgentError(error: unknown): string {
  const message = rawMessage(error);
  const lower = message.toLowerCase();

  if (/unauthorized|401/.test(lower)) {
    return "Connection token was rejected. Open Settings → Agent connection and enter your token again.";
  }
  if (/failed to fetch|networkerror|load failed|could not reach the ag-ui|could not reach your agent/.test(lower)) {
    return "Could not reach your agent. Check that it is running and the URL is correct.";
  }
  if (/502|503|504/.test(lower)) {
    return "Your agent is not responding right now. Try again in a moment.";
  }
  if (/llm not configured|llm_api_key|openai_api_key|no api key/i.test(message)) {
    return "You need to add an API key for your language model (OpenAI, Anthropic, Google, etc.). Open Settings → Agent, paste your key, and save — then try again.";
  }
  if (/verify organization|organization must be verified/i.test(message)) {
    return (
      "Your OpenAI organization must be verified to use some tools with this model. " +
      "Verify in your OpenAI account settings, or switch model in Settings → Agent."
    );
  }
  if (/agent run error/i.test(message)) {
    return "Your agent hit a problem on that turn. Try again in a moment.";
  }
  if (/model endpoint|couldn't reach the model|could not reach the model/i.test(message)) {
    return "Could not reach your language model. Check your API key and network in Settings → Agent.";
  }
  if (message.startsWith("Request failed (") || /custody request failed/i.test(message)) {
    return "Could not reach your agent. Check your connection settings.";
  }
  return GENERIC;
}
