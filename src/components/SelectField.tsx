import { useId } from 'react';

interface SelectFieldProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onChange: (value: string) => void;
  readonly emptyText?: string;
}

export function SelectField({ label, value, options, onChange, emptyText = 'No options available' }: SelectFieldProps) {
  const id = useId();
  const disabled = options.length === 0;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="select"
        value={disabled ? '' : value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {disabled && <option value="">{emptyText}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
