import { describe, expect, it } from 'vitest';
import { normalizeRecord } from '../../src/features/welding/data/normalize';
import { sourceProvenanceItems } from '../../src/features/welding/presentation';
import type { GmawRecord, SourceReference } from '../../src/features/welding/types';
import { gmawSource, TEST_PROVENANCE } from './fixtures';

function gmawWithSource(source: SourceReference, verified = true): GmawRecord {
  return normalizeRecord(
    gmawSource({
      provenance: { ...TEST_PROVENANCE, verified, source },
    }),
  ) as GmawRecord;
}

describe('sourceProvenanceItems', () => {
  it('displays available source and verification metadata with a safe source link', () => {
    const record = gmawWithSource({
      publisher: 'Fictional Manufacturer',
      document: 'Fictional Weld Chart',
      edition: 'Rev A',
      publicationDate: '2025-03-18',
      page: '7',
      tableOrChart: 'Chart 3',
      url: 'https://manufacturer.example/fictional-chart.pdf',
      accessedDate: '2026-10-02',
      notes: 'Fictional test source only.',
    });

    const items = sourceProvenanceItems(record);
    expect(items.map((item) => item.key)).toEqual([
      'publisher',
      'document',
      'edition',
      'publicationDate',
      'page',
      'tableOrChart',
      'url',
      'accessedDate',
      'sourceNotes',
      'verifiedBy',
      'verifiedDate',
    ]);
    expect(items.find((item) => item.key === 'url')).toMatchObject({
      label: 'Source',
      value: 'View source',
      href: 'https://manufacturer.example/fictional-chart.pdf',
    });
  });

  it('omits missing optional fields and developer placeholders', () => {
    const record = gmawWithSource({
      publisher: 'Fictional Manufacturer',
      document: 'Fictional Weld Chart',
      edition: 'Replace with edition',
      page: '',
      tableOrChart: 'YYYY-MM-DD',
      url: 'javascript:alert(1)',
    });

    const keys = sourceProvenanceItems(record).map((item) => item.key);
    expect(keys).toContain('publisher');
    expect(keys).toContain('document');
    expect(keys).not.toContain('edition');
    expect(keys).not.toContain('page');
    expect(keys).not.toContain('tableOrChart');
    expect(keys).not.toContain('url');
  });

  it('does not expose provenance for unverified sample records', () => {
    const record = gmawWithSource(
      {
        publisher: 'SAMPLE DATA',
        document: 'Placeholder values for development only',
      },
      false,
    );

    expect(sourceProvenanceItems(record)).toEqual([]);
  });
});
