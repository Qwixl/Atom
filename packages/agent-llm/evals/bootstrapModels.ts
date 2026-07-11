/**
 * Bootstrap / retry candidates for first-use categorization (exact OpenRouter ids).
 *
 * Models with a current exact assessment under the eval baseline are skipped at
 * runtime — keep this list to **unassessed or invalid-assessment retries only**
 * so weekly/bootstrap jobs do not re-spend on known-good models.
 *
 * Local Ollama models are intentionally absent — family `local-slm` covers them.
 */
export const BOOTSTRAP_EVAL_MODELS: readonly string[] = [
  // Previously catalog-missing or wrong slug — retry with current OpenRouter ids.
  "anthropic/claude-haiku-4.5",
  "x-ai/grok-4.5",
  "cohere/command-r-plus-08-2024",
  // Prior mistral-small-3.1 run was a ~13s empty-response false tool-shy — retest.
  "mistralai/mistral-small-3.2-24b-instruct",
];
