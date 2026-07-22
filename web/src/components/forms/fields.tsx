import { useEffect, useRef, useState } from "react";

// Low-level, presentation-only inputs shared by the preset renderers. Each is
// controlled by the parent's `expected` value and reports edits back up; none
// of them own any part of the labeled value except a NumberInput's text buffer
// (so decimals type naturally). Styling matches the raw-JSON dialog.

const inputClass = "rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100";

export function TextInput({
  value,
  onChange,
  disabled,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      type="text"
      className={inputClass}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
    />
  );
}

export function DateInput({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <input
      type="date"
      className={inputClass}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function numToText(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

// A number input backed by a text buffer so in-progress values keep their exact
// keystrokes ("1.", "1.50") instead of being flattened by a round-trip through
// Number(). Emits `undefined` for an empty/non-finite field (parent drops the
// key) and a finite number otherwise.
export function NumberInput({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [text, setText] = useState<string>(() => numToText(value));
  const lastEmitted = useRef<number | undefined>(value);

  useEffect(() => {
    // Refresh the buffer only for external changes (load, raw→form toggle, null
    // toggle) — not for the value we just emitted, so a trailing "." survives.
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setText(numToText(value));
    }
  }, [value]);

  function handle(next: string) {
    setText(next);
    const trimmed = next.trim();
    const parsed = trimmed === "" ? undefined : Number(trimmed);
    const clean = parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
    lastEmitted.current = clean;
    onChange(clean);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className={inputClass}
      value={text}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => handle(e.target.value)}
      spellCheck={false}
    />
  );
}

export function BoolInput({
  value,
  onChange,
  label,
  ariaLabel,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
  ariaLabel?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function SelectInput({
  value,
  options,
  onChange,
  disabled,
  placeholder = "— select —",
  ariaLabel,
}: {
  value: string | undefined;
  options: string[];
  onChange: (next: string | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      className={inputClass}
      value={value ?? ""}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

// A labeled field row. When `nullable`, a "null" checkbox sits beside the label;
// checking it hands the parent an explicit null and disables the input beneath.
export function Field({
  label,
  required,
  nullable,
  isNull,
  onToggleNull,
  nullAriaLabel,
  children,
}: {
  label: string;
  required?: boolean;
  nullable?: boolean;
  isNull?: boolean;
  onToggleNull?: (next: boolean) => void;
  nullAriaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </span>
        {nullable ? (
          <label className="flex items-center gap-1 text-xs text-slate-500">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={isNull ?? false}
              aria-label={nullAriaLabel}
              onChange={(e) => onToggleNull?.(e.target.checked)}
            />
            null
          </label>
        ) : null}
      </div>
      {children}
    </div>
  );
}
