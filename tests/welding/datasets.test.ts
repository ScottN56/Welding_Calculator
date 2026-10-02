import { describe, expect, it } from 'vitest';
import {
  defineVerifiedDataset,
  recordsFromDatasets,
  type VerifiedDatasetMetadata,
} from '../../src/features/welding/data/datasets';
import type { GmawRecordSource } from '../../src/features/welding/types';
import { gmawSource } from './fixtures';

const metadata: VerifiedDatasetMetadata<'GMAW'> = {
  id: 'test-reference-pack',
  process: 'GMAW',
  source: {
    publisher: 'Test Publisher',
    document: 'Test Reference Chart',
    edition: '1',
    page: '10',
  },
  verifiedBy: 'unit-test',
  verifiedDate: '2026-10-02',
};

function draft(overrides: Partial<GmawRecordSource> = {}): Omit<GmawRecordSource, 'provenance'> {
  const { provenance: _provenance, ...record } = gmawSource(overrides);
  return record;
}

describe('verified reference datasets', () => {
  it('stamps shared verified provenance onto every source record', () => {
    const dataset = defineVerifiedDataset<GmawRecordSource>(metadata, [
      draft({ id: 'a' }),
      draft({ id: 'b' }),
    ]);

    expect(dataset.records).toHaveLength(2);
    for (const record of dataset.records) {
      expect(record.provenance).toEqual({
        verified: true,
        source: metadata.source,
        verifiedBy: 'unit-test',
        verifiedDate: '2026-10-02',
      });
    }
  });

  it('can apply an explicitly declared dataset interpolation policy', () => {
    const withInterpolation = draft({ id: 'a' });
    const { interpolation: _interpolation, ...withoutInterpolation } = withInterpolation;
    const dataset = defineVerifiedDataset<GmawRecordSource>(
      {
        ...metadata,
        interpolationDefault: {
          allowed: true,
          rationale: 'Test-only policy.',
        },
      },
      [withoutInterpolation],
    );

    expect(dataset.records[0]?.interpolation).toEqual({
      allowed: true,
      rationale: 'Test-only policy.',
    });
  });

  it('preserves a record-level interpolation override', () => {
    const dataset = defineVerifiedDataset<GmawRecordSource>(
      {
        ...metadata,
        interpolationDefault: { allowed: true },
      },
      [draft({ interpolation: { allowed: false, rationale: 'Source boundary.' } })],
    );

    expect(dataset.records[0]?.interpolation).toEqual({
      allowed: false,
      rationale: 'Source boundary.',
    });
  });

  it('flattens multiple datasets for the process registry', () => {
    const first = defineVerifiedDataset<GmawRecordSource>(metadata, [draft({ id: 'a' })]);
    const second = defineVerifiedDataset<GmawRecordSource>(
      { ...metadata, id: 'test-reference-pack-2' },
      [draft({ id: 'b' })],
    );

    expect(recordsFromDatasets([first, second]).map((record) => record.id)).toEqual(['a', 'b']);
  });

  it('rejects invalid verifier metadata', () => {
    expect(() =>
      defineVerifiedDataset<GmawRecordSource>(
        { ...metadata, verifiedDate: '10/02/2026' },
        [draft()],
      ),
    ).toThrow(/YYYY-MM-DD/);
  });
});
