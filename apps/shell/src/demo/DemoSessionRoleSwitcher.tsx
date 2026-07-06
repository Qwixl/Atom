import type { DemoSessionRole } from "./demoSessionStorage.js";

export function DemoSessionRoleSwitcher({
  active,
  highlight,
  onSwitch,
}: {
  active: DemoSessionRole;
  highlight?: DemoSessionRole | null;
  onSwitch: (role: DemoSessionRole) => void;
}) {
  const roles: { id: DemoSessionRole; label: string }[] = [
    { id: "alice", label: "Alice" },
    { id: "bob", label: "Bob" },
  ];

  return (
    <div className="demo-persona-switcher" role="group" aria-label="Viewing as">
      <span className="demo-persona-switcher-label">Viewing as</span>
      {roles.map(({ id, label }) => {
        const isActive = active === id;
        const isHighlighted = highlight === id;
        return (
          <button
            key={id}
            type="button"
            className={`demo-persona-btn${isActive ? " is-active" : ""}${isHighlighted ? " is-highlight" : ""}`}
            aria-pressed={isActive}
            onClick={() => onSwitch(id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function highlightRoleForDemoStep(
  step: string,
): DemoSessionRole | null {
  if (step === "switch-bob" || step === "respond") return "bob";
  if (step === "switch-alice" || step === "send") return "alice";
  return null;
}
