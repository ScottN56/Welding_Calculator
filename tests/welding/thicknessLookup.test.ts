import { describe, expect, it } from 'vitest';
import {
  containsThickness,
  interpolationFraction,
  lookupThickness,
  THICKNESS_EPSILON_MM,
} from '../../src/features/welding/calculations';
import { bandedRecords, gmaw } from './fixtures';

describe('thickness lookup', () => {
  const records = bandedRecords();

  it('finds a record containing the thickness', () => {
    const result = lookupThickness(records, 9);
    expect(result.kind).toBe('within');
    expect(result.kind === 'within' && result.matches.map((r) => r.id)).toEqual(['c']);
  });

  it('treats range boundaries as inclusive', () => {
    for (const [t, id] of [[2, 'a'], [3, 'a'], [5, 'b'], [8, 'c'], [10, 'c']] as const) {
      const result = lookupThickness(records, t);
      expect(result.kind === 'within' && result.matches.map((r) => r.id)).toEqual([id]);
    }
  });

  it('tolerates unit-conversion float noise at boundaries', () => {
    const record = gmaw({ thickness: { min: 1 / 8, max: 1 / 8, unit: 'in' } });
    expect(containsThickness(record, 3.175)).toBe(true);
    expect(containsThickness(record, 3.175 + THICKNESS_EPSILON_MM / 2)).toBe(true);
    expect(containsThickness(record, 3.18)).toBe(false);
  });

  it('identifies neighbours in a gap', () => {
    const result = lookupThickness(records, 4);
    expect(result.kind).toBe('between');
    if (result.kind !== 'between') return;
    expect(result.lower.map((r) => r.id)).toEqual(['a']);
    expect(result.upper.map((r) => r.id)).toEqual(['b']);
  });

  it('reports below-min and above-max with the supported envelope', () => {
    const below = lookupThickness(records, 1);
    const above = lookupThickness(records, 12);
    expect(below.kind).toBe('below-min');
    expect(above.kind).toBe('above-max');
    if (below.kind === 'below-min') {
      expect(below.supported).toEqual({ min: 2, max: 10 });
      expect(below.nearest.map((r) => r.id)).toEqual(['a']);
    }
    if (above.kind === 'above-max') expect(above.nearest.map((r) => r.id)).toEqual(['c']);
  });

  it('throws on an empty record list', () => {
    expect(() => lookupThickness([], 3)).toThrow();
  });
});

describe('interpolation fraction', () => {
  it('is 0..1 between edges', () => {
    expect(interpolationFraction(3, 3, 5)).toBe(0);
    expect(interpolationFraction(4, 3, 5)).toBe(0.5);
    expect(interpolationFraction(5, 3, 5)).toBe(1);
  });

  it('refuses to extrapolate', () => {
    expect(() => interpolationFraction(2, 3, 5)).toThrow(/extrapolate/);
    expect(() => interpolationFraction(6, 3, 5)).toThrow(/extrapolate/);
    expect(() => interpolationFraction(4, 5, 5)).toThrow();
  });
});
