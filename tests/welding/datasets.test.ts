import { describe, expect, it } from 'vitest';
import { defineVerifiedDataset, recordsFromDatasets } from '../../src/features/welding/data/datasets';
import { normalizeRecord } from '../../src/features/welding/data/normalize';
import type { GmawRecordSource } from '../../src/features/welding/types';
import { createSourceReference } from '../../src/features/welding/data/sourceReference';
import { validateVerifiedDatasets } from '../../src/features/welding/data/validateDatasets';
import { gmawSource, TEST_PROVENANCE } from './fixtures';

function gmawDraft(overrides: Partial<GmawRecordSource> = {}) {
  const { provenance, ...draft } = gmawSource(overrides);
  void provenance;
  return draft;
}

const metadata = {
  id: 'verified-gmaw-test',
  process: 'GMAW',
  source: {
    ...TEST_PROVENANCE.source,
    edition: 'Fixture Revision 2',
    publicationDate: '2025-04-12',
    page: '4',
    tableOrChart: 'Fixture Chart A',
    url: 'https://manufacturer.example/fictional-chart.pdf',
    accessedDate: '2026-10-02',
    notes: 'Fictional document metadata for tests only.',
  },
  verifiedBy: 'Test Reviewer',
  verifiedDate: '2026-06-01',
} as const;

describe('verified datasets', () => {
  it('adds verified source information', () => {
    const source = gmawSource({ id: 'test-record' });
    const { provenance: _provenance, ...record } = source;
    void _provenance;

    const dataset = defineVerifiedDataset<GmawRecordSource>(
      {
        id: 'test-dataset',
        process: 'GMAW',
        source: {
          publisher: 'Test Publisher',
          document: 'Test Document',
        },
        verifiedBy: 'test',
        verifiedDate: '2026-10-01',
      },
      [record],
    );

    expect(dataset.records[0]?.provenance.verified).toBe(true);
    expect(dataset.records[0]?.id).toBe('test-record');
  });

  it('attaches dataset provenance and defaults interpolation to prohibited', () => {
    const dataset = defineVerifiedDataset<GmawRecordSource>(metadata, [gmawDraft()]);
    const record = dataset.records[0];

    expect(record?.provenance).toEqual({
      verified: true,
      source: metadata.source,
      verifiedBy: metadata.verifiedBy,
      verifiedDate: metadata.verifiedDate,
    });
    expect(record?.interpolation).toBeUndefined();
    expect(normalizeRecord(record!).interpolationPermitted).toBe(false);
    expect(recordsFromDatasets([dataset])).toEqual(dataset.records);
  });

  it('applies dataset interpolation defaults while preserving record overrides', () => {
    const dataset = defineVerifiedDataset<GmawRecordSource>(
      { ...metadata, interpolationDefault: 'linear' },
      [
        gmawDraft({ id: 'default-policy' }),
        gmawDraft({ id: 'record-override', interpolation: 'prohibited' }),
      ],
    );

    expect(dataset.records.map((record) => record.interpolation)).toEqual(['linear', 'prohibited']);
  });

  it('inherits shared source metadata and allows page/chart overrides per record', () => {
    const dataset = defineVerifiedDataset<GmawRecordSource>(metadata, [
      {
        ...gmawDraft(),
        sourceOverride: { page: '8', tableOrChart: 'Fixture Chart B' },
      },
    ]);
    const source = dataset.records[0]?.provenance.source;

    expect(source).toMatchObject({
      ...metadata.source,
      page: '8',
      tableOrChart: 'Fixture Chart B',
    });
    expect(source?.publisher).toBe(metadata.source.publisher);
    expect(validateVerifiedDatasets([dataset])).toEqual([]);
  });

  it('copies source metadata without changing field values', () => {
    const reference = createSourceReference(metadata.source);

    expect(reference).toEqual(metadata.source);
    expect(reference).not.toBe(metadata.source);
  });

  it('combines datasets into one record list', () => {
    expect(recordsFromDatasets([])).toEqual([]);
  });

  it('rejects incomplete verification metadata', () => {
    expect(() => defineVerifiedDataset<GmawRecordSource>({ ...metadata, verifiedBy: ' ' }, [gmawDraft()])).toThrow(
      /verifiedBy is required/,
    );
    expect(() => defineVerifiedDataset<GmawRecordSource>({ ...metadata, verifiedDate: '2026/06/01' }, [gmawDraft()])).toThrow(
      /YYYY-MM-DD/,
    );
  });
    it('rejects template placeholder metadata', () => {
      expect(() =>
        defineVerifiedDataset<GmawRecordSource>(
          {
            ...metadata,
            id: 'replace-with-dataset-id',
          },
          [gmawDraft()],
        ),
      ).toThrow(/must be replaced with verified source information/);
    });
});