import type { Range, WeldingRecord } from '../types';

/** Tolerance for float noise from unit conversion (e.g. 1/8" → 3.175 mm). */
export const THICKNESS_EPSILON_MM = 1e-6;

export function containsThickness(record: WeldingRecord, thicknessMm: number): boolean {
  return (
    thicknessMm >= record.thicknessMm.min - THICKNESS_EPSILON_MM &&
    thicknessMm <= record.thicknessMm.max + THICKNESS_EPSILON_MM
  );
}

export function supportedEnvelope(records: readonly WeldingRecord[]): Range {
  return {
    min: Math.min(...records.map((r) => r.thicknessMm.min)),
    max: Math.max(...records.map((r) => r.thicknessMm.max)),
  };
}

export type ThicknessLookup<R extends WeldingRecord> =
  | { readonly kind: 'within'; readonly matches: readonly R[] }
  /** lower: records ending nearest below; upper: records starting nearest above. */
  | { readonly kind: 'between'; readonly lower: readonly R[]; readonly upper: readonly R[] }
  | { readonly kind: 'below-min'; readonly nearest: readonly R[]; readonly supported: Range }
  | { readonly kind: 'above-max'; readonly nearest: readonly R[]; readonly supported: Range };

/** Locates a thickness relative to the records' thickness ranges. `records` must be non-empty. */
export function lookupThickness<R extends WeldingRecord>(records: readonly R[], thicknessMm: number): ThicknessLookup<R> {
  if (records.length === 0) throw new Error('lookupThickness requires at least one record');

  const matches = records.filter((r) => containsThickness(r, thicknessMm));
  if (matches.length > 0) return { kind: 'within', matches };

  const below = records.filter((r) => r.thicknessMm.max < thicknessMm);
  const above = records.filter((r) => r.thicknessMm.min > thicknessMm);
  const lowerEdge = Math.max(...below.map((r) => r.thicknessMm.max));
  const upperEdge = Math.min(...above.map((r) => r.thicknessMm.min));
  const lower = below.filter((r) => r.thicknessMm.max === lowerEdge);
  const upper = above.filter((r) => r.thicknessMm.min === upperEdge);

  if (lower.length > 0 && upper.length > 0) return { kind: 'between', lower, upper };
  const supported = supportedEnvelope(records);
  if (upper.length > 0) return { kind: 'below-min', nearest: upper, supported };
  return { kind: 'above-max', nearest: lower, supported };
}
