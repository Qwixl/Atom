import type { InputHTMLAttributes } from "react";

type SettingsToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  title?: string;
  disabled?: boolean;
  className?: string;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "checked" | "onChange" | "disabled" | "className" | "title"
>;

/** Visual switch (not a bare checkbox). Use for all Settings on/off controls. */
export function SettingsToggle({
  checked,
  onChange,
  label,
  title,
  disabled,
  className,
  ...rest
}: SettingsToggleProps) {
  return (
    <label
      className={`settings-switch${className ? ` ${className}` : ""}${disabled ? " is-disabled" : ""}`}
      title={title}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-label={rest["aria-label"] ?? label}
        onChange={(e) => onChange(e.target.checked)}
        {...rest}
      />
      <span className="settings-switch-track" aria-hidden="true">
        <span className="settings-switch-thumb" />
      </span>
      <span className="settings-switch-label">{label}</span>
    </label>
  );
}
