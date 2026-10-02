import { useId, useState } from 'react';
import { formatThickness, parseThickness, thicknessInputText } from '../features/welding/conversions';
import { commonThicknessesMm, stepThickness } from '../features/welding/thicknessPresets';
import type { UnitSystem } from '../features/welding/types';

interface ThicknessInputProps {
  readonly valueMm: number;
  readonly system: UnitSystem;
  readonly onChange: (mm: number) => void;
}

const MM_EPSILON = 1e-6;

/** Remount (via `key`) when the value is replaced externally so the text resyncs. */
export function ThicknessInput({ valueMm, system, onChange }: ThicknessInputProps) {
  const id = useId();
  const errorId = useId();
  const [text, setText] = useState(() => thicknessInputText(valueMm, system));
  const [error, setError] = useState<string | null>(null);
  const unit = system === 'imperial' ? 'in' : 'mm';

  const commitValue = (mm: number) => {
    setText(thicknessInputText(mm, system));
    setError(null);
    onChange(mm);
  };

  const onTextChange = (next: string) => {
    setText(next);
    const parsed = parseThickness(next, unit);
    if (parsed.ok) {
      setError(null);
      onChange(parsed.mm);
    } else {
      setError(next.trim() === '' ? 'Enter a thickness.' : parsed.error);
    }
  };

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        Material Thickness <span className="field__unit">({system === 'imperial' ? 'inches' : 'mm'})</span>
      </label>
      <div className="stepper">
        <button
          type="button"
          className="stepper__button"
          aria-label="Thinner"
          onClick={() => commitValue(stepThickness(valueMm, -1, system))}
        >
          −
        </button>
        <input
          id={id}
          className="stepper__input"
          type="text"
          inputMode={system === 'imperial' ? 'text' : 'decimal'}
          autoComplete="off"
          enterKeyHint="done"
          value={text}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          placeholder={system === 'imperial' ? '1/4 or 0.25' : '6'}
          onChange={(e) => onTextChange(e.target.value)}
        />
        <button
          type="button"
          className="stepper__button"
          aria-label="Thicker"
          onClick={() => commitValue(stepThickness(valueMm, 1, system))}
        >
          +
        </button>
      </div>
      {error ? (
        <p className="field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : (
        <p className="field__hint">{formatThickness(valueMm, system === 'imperial' ? 'metric' : 'imperial')}</p>
      )}
      <div className="chips" role="group" aria-label="Common thicknesses">
        {commonThicknessesMm(system).map((mm) => (
          <button
            key={mm}
            type="button"
            className="chip"
            aria-pressed={Math.abs(mm - valueMm) < MM_EPSILON}
            onClick={() => commitValue(mm)}
          >
            {formatThickness(mm, system)}
          </button>
        ))}
      </div>
    </div>
  );
}
