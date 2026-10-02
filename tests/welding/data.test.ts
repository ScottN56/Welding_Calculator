import { describe, expect, it } from 'vitest';
import {
  ALL_RECORD_SOURCES,
  assertVerifiedProductionRecords,
  createRegistry,
  registry,
  VERIFIED_DATASETS,
} from '../../src/features/welding/data/registry';
import { defineVerifiedDataset } from '../../src/features/welding/data/datasets';
import { gmawSampleRecords } from '../../src/features/welding/data/sample/gmawSample';
import { fcawRecords } from '../../src/features/welding/data/records/fcaw';
import { gtawRecords } from '../../src/features/welding/data/records/gtaw';
import { validateRecordSource, validateRecordSources } from '../../src/features/welding/data/validate';
import { normalizeRecord } from '../../src/features/welding/data/normalize';
import type { GmawRecord, GmawRecordSource } from '../../src/features/welding/types';
import { gmawSource } from './fixtures';

function verifiedGmawDataset(recordOverrides: Partial<GmawRecordSource> = {}) {
  const { provenance, ...draft } = gmawSource(recordOverrides);
  void provenance;
  return defineVerifiedDataset<GmawRecordSource>(
    {
      id: 'verified-gmaw-test',
      process: 'GMAW',
      source: { publisher: 'Test Publisher', document: 'Test Reference' },
      verifiedBy: 'Test Reviewer',
      verifiedDate: '2026-10-01',
    },
    [draft],
  );
}

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

  it('checks dataset structure and individual records in a production registry', () => {
    const dataset = verifiedGmawDataset();
    expect(() =>
      createRegistry(dataset.records, {
        requireVerified: true,
        verifiedDatasets: [dataset],
      }),
    ).not.toThrow();

    const missingPublisher = {
      ...dataset,
      metadata: {
        ...dataset.metadata,
        source: { ...dataset.metadata.source, publisher: '' },
      },
    };
    expect(() =>
      createRegistry(dataset.records, {
        requireVerified: true,
        verifiedDatasets: [missingPublisher],
      }),
    ).toThrow(/Invalid verified welding datasets:.*publisher is required/s);

    const invalidRecordDataset = verifiedGmawDataset({ voltage: { min: 20, max: 10 } });
    expect(() =>
      createRegistry(invalidRecordDataset.records, {
        requireVerified: true,
        verifiedDatasets: [invalidRecordDataset],
      }),
    ).toThrow(/Invalid welding reference data/);

    const detachedRecords = verifiedGmawDataset({ id: 'detached-record' }).records;
    expect(() =>
      createRegistry(detachedRecords, {
        requireVerified: true,
        verifiedDatasets: [dataset],
      }),
    ).toThrow(/must come from the validated verified datasets/);
  });

  it('rejects unverified records in a production registry with record ids', () => {
    expect(() => createRegistry(gmawSampleRecords, { requireVerified: true, verifiedDatasets: [] })).toThrow(
      /Production welding data contains unverified records: sample-gmaw-cs-035-c25-a/,
    );
    expect(() => assertVerifiedProductionRecords(gmawSampleRecords)).toThrow(/unverified records/);
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
    expect(VERIFIED_DATASETS.every((dataset) => !dataset.metadata.id.startsWith('replace-with-'))).toBe(true);
    expect(registry.forProcess('GMAW').length).toBe(ALL_RECORD_SOURCES.filter((r) => r.process === 'GMAW').length);
    expect(registry.forProcess('FCAW')).toEqual(fcawRecords);
    expect(registry.hasVerifiedData('FCAW')).toBe(false);
    expect(registry.forProcess('GTAW')).toEqual(gtawRecords);
    expect(registry.hasVerifiedData('GTAW')).toBe(false);
    expect(registry.forProcess('SMAW')).toEqual([]);
    expect(registry.hasVerifiedData('SMAW')).toBe(false);
  });

  it('keeps sample records available in the development/test registry', () => {
    expect(ALL_RECORD_SOURCES.some((record) => record.id.startsWith('sample-gmaw-'))).toBe(true);
    expect(registry.forProcess('GMAW').some((record) => record.id.startsWith('sample-gmaw-'))).toBe(true);
  });

  it('marks every sample record as unverified', () => {
    for (const record of gmawSampleRecords) {
      expect(record.provenance.verified).toBe(false);
      expect(record.provenance.source.publisher).toBe('SAMPLE DATA');
    }
  });
});
