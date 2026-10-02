import { describe, expect, it } from 'vitest';
import { defineVerifiedDataset, type VerifiedDataset } from '../../src/features/welding/data/datasets';
import type { GmawRecordSource, WeldingRecordSource } from '../../src/features/welding/types';
import { gmawSource, TEST_PROVENANCE } from './fixtures';
import { validateVerifiedDatasets } from '../../src/features/welding/data/validateDatasets';

const TEST_SOURCE = {
  ...TEST_PROVENANCE.source,
  edition: 'Fixture Edition 2',
  publicationDate: '2025-03-18',
  page: '7',
  tableOrChart: 'Fictional Chart 3',
  url: 'https://manufacturer.example/fictional-chart.pdf',
  accessedDate: '2026-10-02',
  notes: 'Fictional source metadata for tests only.',
} as const;

function makeDataset(datasetId = 'dataset-a', recordId = 'record-a') {
  const { provenance, ...draft } = gmawSource({ id: recordId });
  void provenance;
  return defineVerifiedDataset<GmawRecordSource>(
    {
      id: datasetId,
      process: 'GMAW',
      source: TEST_SOURCE,
      verifiedBy: TEST_PROVENANCE.verifiedBy,
      verifiedDate: TEST_PROVENANCE.verifiedDate,
    },
    [draft],
  );
}

describe('validateVerifiedDatasets', () => {
  it('accepts a valid dataset', () => {
    expect(validateVerifiedDatasets([makeDataset()])).toEqual([]);
  });

  it('accepts a valid empty dataset template', () => {
    const emptyDataset = defineVerifiedDataset<GmawRecordSource>(
      {
        id: 'empty-template',
        process: 'GMAW',
        source: TEST_SOURCE,
        verifiedBy: TEST_PROVENANCE.verifiedBy,
        verifiedDate: TEST_PROVENANCE.verifiedDate,
      },
      [],
    );

    expect(validateVerifiedDatasets([emptyDataset])).toEqual([]);
  });

  it('rejects duplicate dataset IDs', () => {
    expect(validateVerifiedDatasets([makeDataset('duplicate'), makeDataset('duplicate', 'record-b')])).toContain(
      '[duplicate] duplicate dataset id',
    );
  });

  it('rejects duplicate record IDs across datasets', () => {
    expect(validateVerifiedDatasets([makeDataset('dataset-a', 'same-record'), makeDataset('dataset-b', 'same-record')])).toContain(
      '[dataset-b] duplicate record id: same-record',
    );
  });

  it('rejects a record whose process does not match its dataset', () => {
    const dataset = makeDataset();
    const invalid = {
      ...dataset,
      records: dataset.records.map((record) => ({ ...record, process: 'FCAW' as const })),
    } as unknown as VerifiedDataset<WeldingRecordSource>;

    expect(validateVerifiedDatasets([invalid]).join(' ')).toMatch(/process does not match/);
  });

  it('rejects missing publishers', () => {
    const dataset = makeDataset();
    const invalid = {
      ...dataset,
      metadata: { ...dataset.metadata, source: { ...dataset.metadata.source, publisher: '' } },
    };

    expect(validateVerifiedDatasets([invalid]).join(' ')).toMatch(/publisher is required/);
  });

  it('rejects malformed URLs when a source URL is supplied', () => {
    const dataset = makeDataset();
    const invalid = {
      ...dataset,
      metadata: { ...dataset.metadata, source: { ...dataset.metadata.source, url: 'not a URL' } },
    };

    expect(validateVerifiedDatasets([invalid]).join(' ')).toMatch(/source URL is invalid/);
  });

  it('rejects invalid optional publication and access dates', () => {
    const dataset = makeDataset();
    const invalid = {
      ...dataset,
      metadata: {
        ...dataset.metadata,
        source: {
          ...dataset.metadata.source,
          publicationDate: '2025-02-30',
          accessedDate: '2026/10/02',
        },
      },
    };

    const errors = validateVerifiedDatasets([invalid]).join(' ');
    expect(errors).toMatch(/source publicationDate must use YYYY-MM-DD/);
    expect(errors).toMatch(/source accessedDate must use YYYY-MM-DD/);
  });

  it('rejects invalid verified dates', () => {
    const dataset = makeDataset();
    const invalid = { ...dataset, metadata: { ...dataset.metadata, verifiedDate: '2026/06/01' } };

    expect(validateVerifiedDatasets([invalid]).join(' ')).toMatch(/verifiedDate must use YYYY-MM-DD/);
  });

  it('rejects unverified records inside a verified dataset', () => {
    const dataset = makeDataset();
    const invalid = {
      ...dataset,
      records: dataset.records.map((record) => ({
        ...record,
        provenance: { ...record.provenance, verified: false },
      })),
    };

    expect(validateVerifiedDatasets([invalid]).join(' ')).toMatch(/is not verified/);
  });

  it('rejects record provenance that differs from its dataset metadata', () => {
    const dataset = makeDataset();
    const invalid = {
      ...dataset,
      records: dataset.records.map((record) => ({
        ...record,
        provenance: { ...record.provenance, source: { ...record.provenance.source, document: 'Other document' } },
      })),
    };

    expect(validateVerifiedDatasets([invalid]).join(' ')).toMatch(/provenance source document does not match/);
  });

  it('allows per-record page and table/chart provenance overrides', () => {
    const dataset = makeDataset();
    const withOverrides = defineVerifiedDataset<GmawRecordSource>(
      { ...dataset.metadata, source: TEST_SOURCE },
      [
        {
          ...gmawSource({ id: 'page-override-record' }),
          sourceOverride: { page: '9', tableOrChart: 'Fictional Chart 4' },
        },
      ],
    );

    expect(validateVerifiedDatasets([withOverrides])).toEqual([]);
  });
});
