/**
 * One-time OpenRouter bootstrap candidates (exact provider/model ids).
 * After each id is assessed under the current eval baseline, it is skipped.
 * Local Ollama models are intentionally absent — family local-slm covers them.
 */
export const BOOTSTRAP_EVAL_MODELS: readonly string[] = [
  // OpenAI
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "openai/gpt-4.1-mini",
  "openai/gpt-4.1",
  // Anthropic
  "anthropic/claude-sonnet-4",
  "anthropic/claude-3.5-haiku",
  // Google
  "google/gemini-2.0-flash",
  "google/gemini-2.5-flash",
  // DeepSeek
  "deepseek/deepseek-chat",
  // xAI
  "x-ai/grok-3",
  // Mistral
  "mistralai/mistral-small-3.1-24b-instruct",
  // Cohere
  "cohere/command-r-plus",
  // Qwen
  "qwen/qwen-2.5-72b-instruct",
  // Meta
  "meta-llama/llama-3.3-70b-instruct",
];
