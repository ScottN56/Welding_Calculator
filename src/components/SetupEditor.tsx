import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  ADJUSTED_FIELDS,
  adjustedToTexts,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  parseAdjustedTexts,
  recommendedRangeText,
  validateSetupName,
  type AdjustedKey,
  type AdjustedTexts,
} from '../features/saved-settings/operations';
import type { AdjustedParameters, SavedRecommendation } from '../features/saved-settings/types';
import type { UnitSystem } from '../features/welding/types';

export interface SetupEditorValues {
  readonly name: string;
  readonly notes: string;
  readonly adjusted: AdjustedParameters;
}

interface SetupEditorProps {
  readonly title: string;
  readonly initial: SetupEditorValues;
  readonly recommendation: SavedRecommendation | null;
  readonly system: UnitSystem;
  readonly onSave: (values: SetupEditorValues) => void;
  readonly onCancel: () => void;
}

export function SetupEditor({ title, initial, recommendation, system, onSave, onCancel }: SetupEditorProps) {
  const titleId = useId();
  const nameId = useId();
  const notesId = useId();
  const [name, setName] = useState(initial.name);
  const [notes, setNotes] = useState(initial.notes);
  const [texts, setTexts] = useState<AdjustedTexts>(() => adjustedToTexts(initial.adjusted, system));
  const [nameError, setNameError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AdjustedKey, string>>>({});

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [onCancel]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nameProblem = validateSetupName(name);
    const parsed = parseAdjustedTexts(texts, system);
    setNameError(nameProblem);
    setFieldErrors(parsed.ok ? {} : parsed.errors);
    if (nameProblem || !parsed.ok) return;
    onSave({ name, notes, adjusted: parsed.value });
  };

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <form onSubmit={submit} noValidate>
          <h2 id={titleId} className="sheet__title">
            {title}
          </h2>

          <div className="field">
            <label className="field__label" htmlFor={nameId}>
              Name
            </label>
            <input
              id={nameId}
              className="input"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              autoFocus
              aria-invalid={nameError !== null}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 1/8 fillet – shop MIG"
            />
            {nameError && (
              <p className="field__error" role="alert">
                {nameError}
              </p>
            )}
          </div>

          <fieldset className="fieldset">
            <legend className="field__label">My settings (optional)</legend>
            <div className="grid-2">
              {ADJUSTED_FIELDS.map((field) => {
                const hint = recommendedRangeText(field, recommendation?.values, system);
                const id = `${nameId}-${field.key}`;
                const error = fieldErrors[field.key];
                return (
                  <div className="field" key={field.key}>
                    <label className="field__label field__label--small" htmlFor={id}>
                      {field.label} <span className="field__unit">({field.unitLabel(system)})</span>
                    </label>
                    <input
                      id={id}
                      className="input"
                      inputMode="decimal"
                      value={texts[field.key] ?? ''}
                      aria-invalid={error !== undefined}
                      onChange={(e) => setTexts({ ...texts, [field.key]: e.target.value })}
                    />
                    {error ? (
                      <p className="field__error" role="alert">
                        {error}
                      </p>
                    ) : (
                      hint && <p className="field__hint">Recommended: {hint}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>

          <div className="field">
            <label className="field__label" htmlFor={notesId}>
              Notes
            </label>
            <textarea
              id={notesId}
              className="input textarea"
              rows={3}
              maxLength={MAX_NOTES_LENGTH}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="button-row">
            <button type="button" className="button button--secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="button button--primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
