/** Minimal circle + top-right circumference dot (brand sheet: first minimal icon). */
export function AtomIdent({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="16" cy="16" r="11.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="24.8" cy="7.2" r="3.1" fill="currentColor" />
    </svg>
  );
}
