import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  getLlmProviderPreset,
  rankModelsForPicker,
  type LlmProviderPresetId,
} from "./llmProviderPresets.js";

type Props = {
  presetId: LlmProviderPresetId;
  value: string;
  onChange: (model: string) => void;
  apiModels: string[];
  loading?: boolean;
  /** When false, show a short gate note instead of the picker. */
  canLoadModels: boolean;
  listFailed?: boolean;
  fieldClassName?: string;
  label?: string;
  placeholder?: string;
};

export function LlmModelPicker({
  presetId,
  value,
  onChange,
  apiModels,
  loading = false,
  canLoadModels,
  listFailed = false,
  fieldClassName = "atom-field",
  label = "Model",
  placeholder = "Search or type a model…",
}: Props) {
  const listId = useId();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const suggested = getLlmProviderPreset(presetId).suggestedModels;

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const options = useMemo(
    () =>
      rankModelsForPicker({
        presetId,
        apiModels: apiModels.length > 0 ? apiModels : suggested,
        currentModel: value,
        query: open ? query : "",
      }),
    [apiModels, open, presetId, query, suggested, value],
  );

  const visible = options.slice(0, 80);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    function onDoc(ev: MouseEvent) {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function commit(model: string) {
    onChange(model);
    setQuery(model);
    setOpen(false);
  }

  if (!canLoadModels) {
    return (
      <div className={fieldClassName}>
        <span className="atom-field-label">{label}</span>
        <p className="settings-note">Add your API key to load available models.</p>
      </div>
    );
  }

  return (
    <div className={`${fieldClassName} llm-model-picker`} ref={rootRef}>
      <label className="llm-model-picker-label" htmlFor={listId}>
        <span className="atom-field-label">{label}</span>
      </label>
      {loading ? <p className="settings-note">Loading models…</p> : null}
      {listFailed && !loading ? (
        <p className="settings-note">Could not load the full model list — type a model id or pick a suggestion.</p>
      ) : null}
      <div className="llm-model-picker-control">
        <input
          id={listId}
          className="llm-model-picker-input"
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${listId}-menu`}
          role="combobox"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            onChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setHighlight((h) => Math.min(h + 1, Math.max(visible.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && open && visible[highlight]) {
              e.preventDefault();
              commit(visible[highlight]!);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {open && visible.length > 0 ? (
          <ul id={`${listId}-menu`} className="llm-model-picker-menu" role="listbox">
            {visible.map((id, index) => (
              <li key={id} role="option" aria-selected={id === value}>
                <button
                  type="button"
                  className={
                    index === highlight
                      ? "llm-model-picker-option is-active"
                      : "llm-model-picker-option"
                  }
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => commit(id)}
                >
                  {id}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
