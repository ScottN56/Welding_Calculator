import { useId, type KeyboardEvent } from 'react';

export interface SegmentOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
  readonly hint?: string;
}

interface SegmentedControlProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: readonly SegmentOption<T>[];
  readonly onChange: (value: T) => void;
  /** Grid columns; defaults to the option count (max 4). */
  readonly columns?: number;
}

export function SegmentedControl<T extends string>({ label, value, options, onChange, columns }: SegmentedControlProps<T>) {
  const labelId = useId();
  const enabled = options.filter((o) => !o.disabled);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (delta === 0 || enabled.length === 0) return;
    event.preventDefault();
    const index = enabled.findIndex((o) => o.value === value);
    const next = enabled[(index + delta + enabled.length) % enabled.length];
    if (next) {
      onChange(next.value);
      const container = event.currentTarget;
      requestAnimationFrame(() => container.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
    }
  };

  return (
    <div className="field">
      <span className="field__label" id={labelId}>
        {label}
      </span>
      <div
        className="segmented"
        role="radiogroup"
        aria-labelledby={labelId}
        style={{ gridTemplateColumns: `repeat(${columns ?? Math.min(options.length, 4)}, minmax(0, 1fr))` }}
        onKeyDown={onKeyDown}
      >
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              disabled={option.disabled}
              className="segmented__option"
              onClick={() => onChange(option.value)}
            >
              <span>{option.label}</span>
              {option.hint && <small className="segmented__hint">{option.hint}</small>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
