import type { LengthUnit } from '../types';
import { parseInches } from './fractions';
import { lengthToMm } from './length';

/** Input sanity limit only — not a statement about any process capability. */
export const MAX_THICKNESS_MM = 300;

export type ThicknessParseResult =
  | { readonly ok: true; readonly mm: number }
  | { readonly ok: false; readonly error: string };

const METRIC = /^(\d+(?:[.,]\d*)?|[.,]\d+)\s*(?:mm)?$/i;

export function validateThicknessMm(mm: number): string | null {
  if (!Number.isFinite(mm)) return 'Thickness must be a number.';
  if (mm <= 0) return 'Thickness must be greater than zero.';
  if (mm > MAX_THICKNESS_MM) return `Thickness must be ${MAX_THICKNESS_MM} mm or less.`;
  return null;
}

export function parseThickness(text: string, unit: LengthUnit): ThicknessParseResult {
  let value: number | null;
  if (unit === 'in') {
    value = parseInches(text);
  } else {
    const match = METRIC.exec(text.trim());
    value = match?.[1] === undefined ? null : Number(match[1].replace(',', '.'));
  }

  if (value === null || !Number.isFinite(value)) {
    return {
      ok: false,
      error: unit === 'in' ? 'Enter inches like 1/4, 1-1/2 or 0.25.' : 'Enter millimetres like 6 or 6.5.',
    };
  }

  const mm = lengthToMm(value, unit);
  const error = validateThicknessMm(mm);
  return error === null ? { ok: true, mm } : { ok: false, error };
}
