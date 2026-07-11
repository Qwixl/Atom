import {
  getLlmProviderPreset,
  HOSTED_LLM_PROVIDER_IDS,
  type HostedLlmProviderId,
  resolveHostedLlmConnection,
} from "./llmProviderPresets.js";
import { FieldLabelWithHint, LlmApiKeyHintContent } from "../ui/FieldHint.js";

export type HostedLlmConnectionFieldsValue = {
  providerId: HostedLlmProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
};

type Props = {
  value: HostedLlmConnectionFieldsValue;
  onChange: (next: HostedLlmConnectionFieldsValue) => void;
  /** When true, API key may be empty (placeholder only). */
  apiKeyOptional?: boolean;
  fieldClassName?: string;
};

export function HostedLlmConnectionFields({
  value,
  onChange,
  apiKeyOptional = false,
  fieldClassName = "atom-field",
}: Props) {
  const preset = getLlmProviderPreset(value.providerId);
  const suggestions = getLlmProviderPreset(value.providerId).suggestedModels;
  const listId = `hosted-llm-models-${value.providerId}`;

  function applyProvider(providerId: HostedLlmProviderId) {
    const resolved = resolveHostedLlmConnection({
      providerId,
      baseUrl: providerId === "custom" ? value.baseUrl : undefined,
      model: undefined,
    });
    onChange({
      ...value,
      providerId,
      baseUrl: resolved.baseUrl,
      model: resolved.model,
    });
  }

  return (
    <>
      <label className={fieldClassName}>
        <span className="atom-field-label">Provider</span>
        <select
          value={value.providerId}
          onChange={(e) => applyProvider(e.target.value as HostedLlmProviderId)}
        >
          {HOSTED_LLM_PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {getLlmProviderPreset(id).label}
            </option>
          ))}
        </select>
      </label>
      {preset.note ? <p className="settings-note atom-note">{preset.note}</p> : null}
      {value.providerId === "custom" ? (
        <label className={fieldClassName}>
          <span className="atom-field-label">Endpoint base URL</span>
          <input
            value={value.baseUrl}
            onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
            placeholder="https://api.example.com/v1"
          />
        </label>
      ) : null}
      <label className={fieldClassName}>
        <span className="atom-field-label">
          {value.providerId === "openrouter" ? "Model (provider/model id)" : "Model"}
        </span>
        <input
          list={suggestions.length > 0 ? listId : undefined}
          value={value.model}
          onChange={(e) => onChange({ ...value, model: e.target.value })}
          placeholder={
            value.providerId === "openrouter" ? "openai/gpt-4o-mini" : "gpt-4o-mini"
          }
        />
        {suggestions.length > 0 ? (
          <datalist id={listId}>
            {suggestions.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        ) : null}
      </label>
      <label className={fieldClassName}>
        <FieldLabelWithHint label="LLM API key" hint={<LlmApiKeyHintContent />} />
        <input
          type="password"
          autoComplete="off"
          value={value.apiKey}
          onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
          placeholder={apiKeyOptional ? "sk-… (required to update)" : "sk-…"}
        />
      </label>
    </>
  );
}

export function defaultHostedLlmConnectionFields(
  providerId: HostedLlmProviderId = "openai",
): HostedLlmConnectionFieldsValue {
  const resolved = resolveHostedLlmConnection({ providerId });
  return {
    providerId: resolved.provider,
    baseUrl: resolved.baseUrl,
    model: resolved.model,
    apiKey: "",
  };
}
