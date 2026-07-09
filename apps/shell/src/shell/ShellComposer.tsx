import { useLayoutEffect, useRef } from "react";
import { resizeTextareaToContent } from "../ui/resizeTextareaToContent.js";

type ShellComposerProps = {
  value: string;
  busy?: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
};

export function ShellComposer({ value, busy, onChange, onSubmit }: ShellComposerProps) {
  const trimmed = value.trim();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el) resizeTextareaToContent(el);
  }, [value]);

  function handleSubmit() {
    if (!trimmed || busy) return;
    onSubmit(trimmed);
  }

  return (
    <footer className="shell-composer">
      <div className="shell-composer-inner">
        <textarea
          ref={textareaRef}
          name="atom-chat-compose"
          rows={1}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={true}
          inputMode="text"
          value={value}
          aria-label="Message to your agent"
          placeholder="Tell your agent what you want…"
          disabled={busy}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter inserts a newline. Ctrl/Cmd+Enter sends (desktop shortcut).
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              handleSubmit();
            }
          }}
        />
        <button type="button" className="shell-btn shell-btn-primary" onClick={handleSubmit} disabled={!trimmed || busy}>
          Send
        </button>
      </div>
    </footer>
  );
}
