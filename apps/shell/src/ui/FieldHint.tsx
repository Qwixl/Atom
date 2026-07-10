import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { useId } from "react";

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6M12 7h.01" />
    </svg>
  );
}

export function FieldHint({ children }: { children: ReactNode }) {
  const id = useId();

  return (
    <>
      <button
        type="button"
        className="atom-field-hint-trigger"
        {...({ popovertarget: id } as ButtonHTMLAttributes<HTMLButtonElement>)}
        aria-label="More information"
      >
        <InfoIcon />
      </button>
      <div
        id={id}
        className="atom-field-hint-popover"
        {...({ popover: "auto" } as HTMLAttributes<HTMLDivElement>)}
      >
        {children}
      </div>
    </>
  );
}

export function FieldLabelWithHint({ label, hint }: { label: string; hint: ReactNode }) {
  return (
    <span className="atom-field-label-row">
      <span className="atom-field-label">{label}</span>
      <FieldHint>{hint}</FieldHint>
    </span>
  );
}

export function LlmApiKeyHintContent() {
  return (
    <>
      <p>
        Your agent uses this key to call a language model when you chat and when it needs to turn
        plain language into structured actions. Agent-to-agent coordination uses signed data objects,
        not this key.
      </p>
      <p>
        Atom is <strong>provider agnostic</strong>: any service with an OpenAI-compatible{" "}
        <code>/v1/chat/completions</code> API works — OpenAI,{" "}
        <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
          OpenRouter
        </a>{" "}
        (one key for many providers/models), Anthropic-compatible gateways, Google AI, Groq,
        Mistral, Together, and others.
      </p>
      <p>
        <strong>Where to get a key:</strong> create one in your provider&apos;s developer console
        (e.g.{" "}
        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
          OpenAI
        </a>
        ,{" "}
        <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
          OpenRouter
        </a>
        ,{" "}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
          Anthropic
        </a>
        ,{" "}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
          Google AI
        </a>
        ). For OpenRouter, pick a model id like <code>openai/gpt-4o-mini</code> or{" "}
        <code>anthropic/claude-sonnet-4</code>.
      </p>
      <p>
        <strong>Self-hosted models:</strong> run{" "}
        <a href="https://ollama.com" target="_blank" rel="noreferrer">
          Ollama
        </a>
        , LM Studio, or vLLM on your machine (Ollama uses port <code>11434</code>, path{" "}
        <code>/v1</code>). Prompts and replies stay on your hardware.
      </p>
      <p>
        On hosted signup, the key is stored on your provisioned agent server — not in the browser.{" "}
        <a href="/how-it-works/">How it works →</a>
      </p>
    </>
  );
}
