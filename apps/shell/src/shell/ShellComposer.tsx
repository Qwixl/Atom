type ShellComposerProps = {
  value: string;
  busy?: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
};

export function ShellComposer({ value, busy, onChange, onSubmit }: ShellComposerProps) {
  const trimmed = value.trim();

  function handleSubmit() {
    if (!trimmed || busy) return;
    onSubmit(trimmed);
  }

  return (
    <footer className="shell-composer">
      <div className="shell-composer-inner">
        <input
          value={value}
          aria-label="Message to your agent"
          placeholder="Tell your agent what you want…"
          disabled={busy}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
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
