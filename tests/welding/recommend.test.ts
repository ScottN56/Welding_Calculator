import { describe, expect, it } from 'vitest';
import {
  getConsumableOptions,
  INTERPOLATION_WARNING,
  recommend,
  UNVERIFIED_WARNING,
} from '../../src/features/welding/calculations';
import { inchesToMm } from '../../src/features/welding/conversions';
import { gmawDefinition } from '../../src/features/welding/processes/gmaw';
import { normalizeRecord } from '../../src/features/welding/data/normalize';
import { bandedRecords, gmaw, gmawSource, input, METRIC, TEST_PROVENANCE } from './fixtures';

const UNVERIFIED = { verified: false, source: { publisher: 'x', document: 'y' } } as const;

describe('recommend: exact matches', () => {
  it('returns the containing record', () => {
    const result = recommend(gmawDefinition, bandedRecords(), input({ thicknessMm: 9 }), METRIC);
    expect(result.status).toBe('exact');
    if (result.status !== 'exact') return;
    expect(result.values.id).toBe('c');
    expect(result.values.voltage).toEqual({ min: 30, max: 40 });
    expect(result.dataQuality).toBe('verified');
    expect(result.warnings).toEqual([]);
  });

  it('matches at the exact boundary values', () => {
    for (const [t, id] of [[2, 'a'], [3, 'a'], [8, 'c'], [10, 'c']] as const) {
      const result = recommend(gmawDefinition, bandedRecords(), input({ thicknessMm: t }), METRIC);
      expect(result.status === 'exact' && result.values.id).toBe(id);
    }
  });

  it('prefers the narrowest range when equivalent records overlap', () => {
    const records = [
      gmaw({ id: 'wide', thickness: { min: 2, max: 6, unit: 'mm' } }),
      gmaw({ id: 'narrow', thickness: { min: 3, max: 4, unit: 'mm' } }),
    ];
    const result = recommend(gmawDefinition, records, input({ thicknessMm: 3.5 }), METRIC);
    expect(result.status === 'exact' && result.values.id).toBe('narrow');
    expect(result.explanation.join(' ')).toMatch(/narrowest/);
  });
});

describe('recommend: parameter table selection', () => {
  const records = [
    gmaw({ id: 'steel-09', wireDiameter: { value: 0.9, unit: 'mm' } }),
    gmaw({ id: 'steel-12', wireDiameter: { value: 1.2, unit: 'mm' } }),
    gmaw({ id: 'steel-c10', gas: 'ar90-co2-10' }),
    gmaw({ id: 'stainless', material: 'stainless-steel', wireClass: 'WIRE-S' }),
    gmaw({ id: 'flat-only', wireClass: 'WIRE-F', positions: ['flat'] }),
  ];

  it('selects by wire diameter', () => {
    const r = recommend(gmawDefinition, records, input({ consumable: { wireClass: 'WIRE-A', wireDiameter: '1.200', gas: 'ar75-co2-25' } }), METRIC);
    expect(r.status === 'exact' && r.values.id).toBe('steel-12');
  });

  it('selects by gas', () => {
    const r = recommend(gmawDefinition, records, input({ consumable: { wireClass: 'WIRE-A', wireDiameter: '0.900', gas: 'ar90-co2-10' } }), METRIC);
    expect(r.status === 'exact' && r.values.id).toBe('steel-c10');
  });

  it('selects by material', () => {
    const r = recommend(
      gmawDefinition,
      records,
      input({ material: 'stainless-steel', consumable: { wireClass: 'WIRE-S', wireDiameter: '0.900', gas: 'ar75-co2-25' } }),
      METRIC,
    );
    expect(r.status === 'exact' && r.values.id).toBe('stainless');
  });

  it('matches imperial-entered wire diameters', () => {
    const imperial = [gmaw({ id: 'imp', wireDiameter: { value: 0.035, unit: 'in' } })];
    const r = recommend(gmawDefinition, imperial, input({ consumable: { wireClass: 'WIRE-A', wireDiameter: '0.889', gas: 'ar75-co2-25' } }), METRIC);
    expect(r.status === 'exact' && r.values.id).toBe('imp');
  });
});

describe('recommend: interpolation', () => {
  it('interpolates linearly between neighbouring records', () => {
    // Midway between a (max 3) and b (min 5).
    const result = recommend(gmawDefinition, bandedRecords(), input({ thicknessMm: 4 }), METRIC);
    expect(result.status).toBe('interpolated');
    if (result.status !== 'interpolated') return;
    expect(result.values.voltage).toEqual({ min: 15, max: 25 });
    expect(result.values.wireFeedMmPerMin).toEqual({ min: 2000, max: 3000 });
    expect(result.sources.map((r) => r.id)).toEqual(['a', 'b']);
    expect(result.warnings).toContain(INTERPOLATION_WARNING);
    expect(result.explanation.join(' ')).toMatch(/50%/);
  });

  it('does not interpolate unless both records explicitly permit it', () => {
    const permitted = [
      gmaw({ id: 'a', thickness: { min: 2, max: 3, unit: 'mm' }, interpolation: 'linear' }),
      gmaw({ id: 'b', thickness: { min: 5, max: 6, unit: 'mm' }, interpolation: 'prohibited' }),
    ];
    const result = recommend(gmawDefinition, permitted, input({ thicknessMm: 4 }), METRIC);
    expect(result.status).toBe('gap');
    expect(result.explanation.join(' ')).toMatch(/not explicitly permitted/);
  });

  it('normalizes verified source records to interpolation disabled by default', () => {
    const source = gmawSource();
    expect(source.provenance.verified).toBe(true);
    expect(source.interpolation).toBeUndefined();
    expect(normalizeRecord(source).interpolationPermitted).toBe(false);
  });

  it('leaves a field undefined if either neighbour lacks it', () => {
    const records = [gmaw({ id: 'a', thickness: { min: 2, max: 3, unit: 'mm' } }), gmaw({ id: 'b', thickness: { min: 5, max: 6, unit: 'mm' } })];
    const withoutAmps = [records[0]!, { ...records[1]!, amperage: undefined }];
    const result = recommend(gmawDefinition, withoutAmps, input({ thicknessMm: 4 }), METRIC);
    expect(result.status === 'interpolated' && result.values.amperage).toBeUndefined();
  });

  it('does not interpolate across different transfer modes', () => {
    const records = [
      gmaw({ id: 'sc', thickness: { min: 2, max: 3, unit: 'mm' }, transferMode: 'short-circuit' }),
      gmaw({ id: 'spray', thickness: { min: 5, max: 6, unit: 'mm' }, transferMode: 'spray' }),
    ];
    const result = recommend(gmawDefinition, records, input({ thicknessMm: 4 }), METRIC);
    expect(result.status).toBe('gap');
    expect(result.explanation.join(' ')).toMatch(/Transfer Mode/);
  });
});

describe('recommend: no extrapolation', () => {
  it('returns no values below the supported range', () => {
    const result = recommend(gmawDefinition, bandedRecords(), input({ thicknessMm: 1 }), METRIC);
    expect(result.status).toBe('out-of-range');
    expect('values' in result).toBe(false);
    if (result.status !== 'out-of-range') return;
    expect(result.direction).toBe('below-min');
    expect(result.supportedRangeMm).toEqual({ min: 2, max: 10 });
    expect(result.nearest.id).toBe('a');
  });

  it('returns no values above the supported range', () => {
    const result = recommend(gmawDefinition, bandedRecords(), input({ thicknessMm: 10.01 }), METRIC);
    expect(result.status).toBe('out-of-range');
    expect(result.status === 'out-of-range' && result.direction).toBe('above-max');
    expect(result.warnings.join(' ')).toMatch(/extrapolated/);
  });

  it('formats the explanation in the selected unit system', () => {
    const records = [gmaw({ thickness: { min: 1 / 8, max: 1 / 4, unit: 'in' } })];
    const result = recommend(gmawDefinition, records, input({ thicknessMm: inchesToMm(1 / 2) }), {
      unitSystem: 'imperial',
      includeUnverified: true,
    });
    expect(result.explanation.join(' ')).toContain('1/2"');
    expect(result.explanation.join(' ')).toContain('1/4"');
  });
});

describe('recommend: unsupported combinations', () => {
  const records = bandedRecords();

  it('reports the material stage', () => {
    const r = recommend(gmawDefinition, records, input({ material: 'aluminum' }), METRIC);
    expect(r.status === 'unsupported' && r.stage).toBe('material');
  });

  it('reports the position stage', () => {
    const flatOnly = [gmaw({ positions: ['flat'] })];
    const r = recommend(gmawDefinition, flatOnly, input({ position: 'overhead' }), METRIC);
    expect(r.status === 'unsupported' && r.stage).toBe('position');
  });

  it('reports the joint stage', () => {
    const buttOnly = [gmaw({ joints: ['butt'] })];
    const r = recommend(gmawDefinition, buttOnly, input({ joint: 'lap' }), METRIC);
    expect(r.status === 'unsupported' && r.stage).toBe('joint');
  });

  it('reports the consumable field that failed', () => {
    const r = recommend(gmawDefinition, records, input({ consumable: { wireClass: 'NOPE', wireDiameter: '0.900', gas: 'ar75-co2-25' } }), METRIC);
    expect(r.status).toBe('unsupported');
    if (r.status !== 'unsupported') return;
    expect(r.stage).toBe('consumable');
    expect(r.field).toBe('wireClass');
  });

  it('reports when a process has no data', () => {
    expect(recommend(gmawDefinition, [], input(), METRIC).status).toBe('unsupported');
  });

  it('excludes unverified records when requested', () => {
    const records = [gmaw({ provenance: UNVERIFIED })];
    const r = recommend(gmawDefinition, records, input(), { unitSystem: 'metric', includeUnverified: false });
    expect(r.status === 'unsupported' && r.stage).toBe('verification');
  });

  it('flags unverified data when included', () => {
    const records = [gmaw({ provenance: UNVERIFIED })];
    const r = recommend(gmawDefinition, records, input(), METRIC);
    expect(r.status === 'exact' && r.dataQuality).toBe('unverified');
    expect(r.warnings).toContain(UNVERIFIED_WARNING);
  });

  it('marks interpolation unverified if either neighbour is unverified', () => {
    const records = [gmaw({ id: 'a', thickness: { min: 2, max: 3, unit: 'mm' } }), gmaw({ id: 'b', thickness: { min: 5, max: 6, unit: 'mm' }, provenance: UNVERIFIED })];
    const r = recommend(gmawDefinition, records, input({ thicknessMm: 4 }), METRIC);
    expect(r.status === 'interpolated' && r.dataQuality).toBe('unverified');
  });
});

describe('recommend: ambiguity and input validation', () => {
  it('asks the user to choose when records differ in transfer mode', () => {
    const records = [gmaw({ id: 'sc', transferMode: 'short-circuit' }), gmaw({ id: 'sp', transferMode: 'spray' })];
    const r = recommend(gmawDefinition, records, input(), METRIC);
    expect(r.status).toBe('ambiguous');
    expect(r.status === 'ambiguous' && r.differingFields).toEqual(['Transfer Mode']);

    const chosen = recommend(gmawDefinition, records, input({ consumable: { ...input().consumable, transferMode: 'spray' } }), METRIC);
    expect(chosen.status === 'exact' && chosen.values.id).toBe('sp');
  });

  it('rejects invalid thickness', () => {
    for (const t of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(recommend(gmawDefinition, bandedRecords(), input({ thicknessMm: t }), METRIC).status).toBe('invalid-input');
    }
  });

  it('requires mandatory consumable selections', () => {
    const r = recommend(gmawDefinition, bandedRecords(), input({ consumable: { wireClass: 'WIRE-A' } }), METRIC);
    expect(r.status).toBe('invalid-input');
    expect(r.status === 'invalid-input' && r.errors.length).toBe(2);
  });

  it('rejects a mismatched process', () => {
    expect(recommend(gmawDefinition, bandedRecords(), input({ process: 'SMAW' }), METRIC).status).toBe('invalid-input');
  });

  it('reports an unsupported position before missing consumables', () => {
    const flatOnly = [gmaw({ positions: ['flat'] })];
    const r = recommend(gmawDefinition, flatOnly, input({ position: 'vertical', consumable: {} }), METRIC);
    expect(r.status === 'unsupported' && r.stage).toBe('position');
  });
});

describe('consumable options', () => {
  const records = [
    gmaw({ id: '1', wireClass: 'WIRE-A', wireDiameter: { value: 0.9, unit: 'mm' } }),
    gmaw({ id: '2', wireClass: 'WIRE-A', wireDiameter: { value: 1.2, unit: 'mm' } }),
    gmaw({ id: '3', wireClass: 'WIRE-B', wireDiameter: { value: 1.0, unit: 'mm' } }),
    gmaw({ id: '4', material: 'aluminum', wireClass: 'WIRE-AL', provenance: TEST_PROVENANCE }),
  ];

  it('derives options from data matching earlier selections', () => {
    const wires = getConsumableOptions(gmawDefinition, records, input(), 'wireClass', METRIC);
    expect(wires.map((o) => o.value)).toEqual(['WIRE-A', 'WIRE-B']);

    const diameters = getConsumableOptions(gmawDefinition, records, input(), 'wireDiameter', METRIC);
    expect(diameters.map((o) => o.value)).toEqual(['0.900', '1.200']);
    expect(diameters.map((o) => o.label)).toEqual(['0.9 mm', '1.2 mm']);
  });

  it('returns no options when nothing matches', () => {
    expect(getConsumableOptions(gmawDefinition, records, input({ position: 'overhead', material: 'stainless-steel' }), 'wireClass', METRIC)).toEqual([]);
  });
});
