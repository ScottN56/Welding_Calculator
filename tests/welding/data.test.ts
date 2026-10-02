import { describe, expect, it } from 'vitest';
import { ALL_RECORD_SOURCES, createRegistry, registry } from '../../src/features/welding/data/registry';
import { gmawSampleRecords } from '../../src/features/welding/data/sample/gmawSample';
import { validateRecordSource, validateRecordSources } from '../../src/features/welding/data/validate';
import { normalizeRecord } from '../../src/features/welding/data/normalize';
import type { GmawRecord } from '../../src/features/welding/types';
import { gmawSource } from './fixtures';

describe('record validation', () => {
  it('accepts a valid record', () => {
    expect(validateRecordSource(gmawSource())).toEqual([]);
  });

  it('rejects inverted ranges and non-positive thickness', () => {
    const errors = validateRecordSource(
      gmawSource({ voltage: { min: 20, max: 10 }, thickness: { min: 0, max: 3, unit: 'mm' } }),
    );
    expect(errors.some((e) => e.startsWith('voltage'))).toBe(true);
    expect(errors.some((e) => e.startsWith('thickness'))).toBe(true);
  });

  it('requires verifier details on verified records', () => {
    const errors = validateRecordSource(
      gmawSource({ provenance: { verified: true, source: { publisher: 'p', document: 'd' } } }),
    );
    expect(errors).toContain('provenance.verifiedBy: required when verified');
    expect(errors.some((e) => e.startsWith('provenance.verifiedDate'))).toBe(true);
  });

  it('rejects empty applicability lists and duplicate ids', () => {
    expect(validateRecordSource(gmawSource({ positions: [] }))).toHaveLength(1);
    expect(validateRecordSources([gmawSource({ id: 'x' }), gmawSource({ id: 'x' })])).toContain('[x] duplicate id');
  });

  it('createRegistry throws on invalid data', () => {
    expect(() => createRegistry([gmawSource({ voltage: { min: 5, max: 1 } })])).toThrow(/Invalid welding reference data/);
  });
});

describe('normalization to canonical units', () => {
  it('converts imperial chart units', () => {
    const r = normalizeRecord(
      gmawSource({
        thickness: { min: 1 / 8, max: 1 / 4, unit: 'in' },
        wireDiameter: { value: 0.035, unit: 'in' },
        wireFeed: { min: 100, max: 200, unit: 'ipm' },
        gasFlow: { min: 30, max: 40, unit: 'cfh' },
      }),
    ) as GmawRecord;
    expect(r.thicknessMm.min).toBeCloseTo(3.175, 10);
    expect(r.thicknessMm.max).toBeCloseTo(6.35, 10);
    expect(r.wireDiameterMm).toBeCloseTo(0.889, 10);
    expect(r.wireFeedMmPerMin).toEqual({ min: 2540, max: 5080 });
    expect(r.gasFlowLpm?.min).toBeCloseTo(14.158, 3);
  });

  it('converts metric chart units', () => {
    const r = normalizeRecord(gmawSource({ wireFeed: { min: 4, max: 6, unit: 'm/min' } })) as GmawRecord;
    expect(r.wireFeedMmPerMin).toEqual({ min: 4000, max: 6000 });
  });
});

describe('bundled data', () => {
  it('loads and validates', () => {
    expect(validateRecordSources(ALL_RECORD_SOURCES)).toEqual([]);
    expect(registry.forProcess('GMAW').length).toBe(ALL_RECORD_SOURCES.filter((r) => r.process === 'GMAW').length);
  });

  it('marks every sample record as unverified', () => {
    for (const record of gmawSampleRecords) {
      expect(record.provenance.verified).toBe(false);
      expect(record.provenance.source.publisher).toBe('SAMPLE DATA');
    }
  });
});
