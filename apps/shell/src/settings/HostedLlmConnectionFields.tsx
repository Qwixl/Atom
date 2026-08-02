import { useCallback, useEffect, useState } from "react";
import {
  getLlmProviderPreset,
  HOSTED_LLM_PROVIDER_GROUPS,
  type HostedLlmProviderId,
  resolveHostedLlmConnection,
} from "./llmProviderPresets.js";
import { FieldLabelWithHint, LlmApiKeyHintContent } from "../ui/FieldHint.js";
import { LlmModelPicker } from "./LlmModelPicker.js";
import { listHostedLlmModels } from "../auth/hostedAccount.js";

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
  /** True when a key is already stored on the hosted agent. */
  hasSavedKey?: boolean;
  fieldClassName?: string;
};

export function HostedLlmConnectionFields({
  value,
  onChange,
  apiKeyOptional = false,
  hasSavedKey = false,
  fieldClassName = "atom-field",
}: Props) {
  const preset = getLlmProviderPreset(value.providerId);
  const canLoadModels = hasSavedKey || Boolean(value.apiKey.trim());
  const [apiModels, setApiModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [listFailed, setListFailed] = useState(false);

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
    setApiModels([]);
    setListFailed(false);
  }

  const loadModels = useCallback(async () => {
    if (!canLoadModels) {
      setApiModels([]);
      setListFailed(false);
      return;
    }
    const resolved = resolveHostedLlmConnection({
      providerId: value.providerId,
      baseUrl: value.baseUrl,
      model: value.model,
    });
    if (!resolved.baseUrl.trim() && value.providerId === "custom") {
      setApiModels([]);
      return;
    }
    setModelsLoading(true);
    try {
      const listed = await listHostedLlmModels({
        apiKey: value.apiKey.trim() || undefined,
        baseUrl: resolved.baseUrl || undefined,
        provider: resolved.provider,
      });
      setApiModels(listed.models);
      setListFailed(false);
    } catch {
      setApiModels([]);
      setListFailed(true);
    } finally {
      setModelsLoading(false);
    }
  }, [canLoadModels, value.apiKey, value.baseUrl, value.model, value.providerId]);

  useEffect(() => {
    if (!canLoadModels) return;
    const delay = value.apiKey.trim() ? 450 : 0;
    const timer = setTimeout(() => void loadModels(), delay);
    return () => clearTimeout(timer);
  }, [canLoadModels, loadModels, value.apiKey, value.providerId, value.baseUrl]);

  return (
    <>
      <label className={fieldClassName}>
        <span className="atom-field-label">AI provider</span>
        <select
          value={value.providerId}
          onChange={(e) => applyProvider(e.target.value as HostedLlmProviderId)}
        >
          {HOSTED_LLM_PROVIDER_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.ids.map((id) => (
                <option key={id} value={id}>
                  {getLlmProviderPreset(id).label}
                </option>
              ))}
            </optgroup>
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
      {hasSavedKey && !value.apiKey.trim() ? (
        <div className="settings-saved-key">
          <span className="settings-saved-key-label">AI key</span>
          <span className="settings-saved-key-value">Already saved</span>
        </div>
      ) : null}
      <label className={fieldClassName}>
        <FieldLabelWithHint
          label={hasSavedKey && !value.apiKey.trim() ? "New AI key (optional)" : "AI key"}
          hint={<LlmApiKeyHintContent />}
        />
        <input
          type="password"
          autoComplete="off"
          value={value.apiKey}
          onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
          placeholder={
            apiKeyOptional || hasSavedKey ? "Leave blank to keep your saved key" : "Paste your key"
          }
        />
      </label>
      <LlmModelPicker
        presetId={value.providerId}
        value={value.model}
        onChange={(model) => onChange({ ...value, model })}
        apiModels={apiModels}
        loading={modelsLoading}
        canLoadModels={canLoadModels}
        listFailed={listFailed}
        fieldClassName={fieldClassName}
        label="Model"
        placeholder={
          value.providerId === "openrouter"
            ? "Search for a model…"
            : "Search or type a model…"
        }
      />
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
