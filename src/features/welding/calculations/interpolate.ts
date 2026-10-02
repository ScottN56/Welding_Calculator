import type { ProcessDefinition } from '../processes';
import type { Range, WeldingRecord } from '../types';

export function lerp(a: number, b: number, fraction: number): number {
  return a + (b - a) * fraction;
}

export function interpolateRange(a: Range, b: Range, fraction: number): Range {
  return { min: lerp(a.min, b.min, fraction), max: lerp(a.max, b.max, fraction) };
}

/** Position of t between the lower record's max and the upper record's min, in [0, 1]. */
export function interpolationFraction(thicknessMm: number, lowerEdgeMm: number, upperEdgeMm: number): number {
  if (upperEdgeMm <= lowerEdgeMm) throw new Error('upper edge must be greater than lower edge');
  const fraction = (thicknessMm - lowerEdgeMm) / (upperEdgeMm - lowerEdgeMm);
  if (fraction < 0 || fraction > 1) throw new Error('Refusing to extrapolate: thickness is outside the two records');
  return fraction;
}

/**
 * Builds a synthesized record by linear interpolation of every range field.
 * Fields missing from either record are left undefined rather than guessed.
 */
export function interpolateRecords<R extends WeldingRecord>(
  definition: ProcessDefinition<R>,
  lower: R,
  upper: R,
  thicknessMm: number,
): R {
  const fraction = interpolationFraction(thicknessMm, lower.thicknessMm.max, upper.thicknessMm.min);
  const result: Record<string, unknown> = {
    ...lower,
    id: `interpolated:${lower.id}+${upper.id}`,
    thicknessMm: { min: thicknessMm, max: thicknessMm },
    notes: [...new Set([...lower.notes, ...upper.notes])],
    provenance: {
      verified: lower.provenance.verified && upper.provenance.verified,
      source: { publisher: 'Interpolated', document: `Between records ${lower.id} and ${upper.id}` },
    },
  };
  for (const key of definition.rangeKeys) {
    const a = lower[key] as Range | undefined;
    const b = upper[key] as Range | undefined;
    result[key as string] = a && b ? interpolateRange(a, b, fraction) : undefined;
  }
  return result as R;
}
