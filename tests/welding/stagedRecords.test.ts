import { describe, expect, it } from 'vitest';
import { promoteStagedRecord } from '../../src/features/welding/data/staging/promoteStagedRecord';
import type { StagedWeldingRecord } from '../../src/features/welding/data/staging/types';
import { validateStagedRecord } from '../../src/features/welding/data/staging/validateStagedRecord';
import { gmawSource } from './fixtures';
import type { GmawRecordSource } from '../../src/features/welding/types';
import type { VerifiedDatasetMetadata } from '../../src/features/welding/data/datasets';

const metadata: VerifiedDatasetMetadata<'GMAW'> = {
  id: 'fictional-gmaw-dataset',
  process: 'GMAW',
  source: {
    publisher: 'Fictional Manufacturer',
    document: 'Fictional GMAW Chart',
    edition: 'Fictional Revision A',
    page: 'Fictional Page 1',
    tableOrChart: 'Fictional Table A',
  },
  verifiedBy: 'Fictional Reviewer',
  verifiedDate: '2026-10-01',
  interpolationDefault: 'prohibited',
};

function createStagedRecord(
  recordOverrides: Partial<GmawRecordSource> = {},
  changes: Partial<Pick<StagedWeldingRecord<GmawRecordSource>, 'sourceDatasetId' | 'reviewStatus' | 'reviewerNotes'>> = {},
): StagedWeldingRecord<GmawRecordSource> {
  const sourceRecord = gmawSource({
    ...recordOverrides,
    provenance: { verified: false, source: metadata.source },
  });
  const { provenance, ...draftFields } = sourceRecord;

  return {
    draft: {
      ...draftFields,
      provenance: { verified: false, source: provenance.source },
    },
    sourceDatasetId: changes.sourceDatasetId ?? metadata.id,
    reviewStatus: changes.reviewStatus ?? 'ready',
    reviewerNotes: changes.reviewerNotes ?? 'Reviewed against fictional fixture source.',
    validationErrors: [],
    readyForVerification: false,
  };
}

describe('staged welding records', () => {
  it('marks an incomplete draft not ready and prevents promotion', () => {
    const staged = validateStagedRecord(createStagedRecord({ wireClass: '' }));
    const result = promoteStagedRecord(staged, metadata);

    expect(staged.readyForVerification).toBe(false);
    expect(staged.validationErrors.join(' ')).toMatch(/wireClass/);
    expect(result.ok).toBe(false);
  });

  it('does not promote a record that fails record validation', () => {
    const staged = validateStagedRecord(
      createStagedRecord({ voltage: { min: 20, max: 10 } }),
    );
    const result = promoteStagedRecord(staged, metadata);

    expect(staged.validationErrors.join(' ')).toMatch(/voltage/);
    expect(result.ok).toBe(false);
  });

  it('does not promote a record still in draft review status', () => {
    const staged = validateStagedRecord(createStagedRecord({}, { reviewStatus: 'draft' }));
    const result = promoteStagedRecord(staged, metadata);

    expect(staged.readyForVerification).toBe(true);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(' ')).toMatch(/review status must be ready/);
  });

  it('does not promote without a verifier', () => {
    const staged = validateStagedRecord(createStagedRecord());
    const result = promoteStagedRecord(staged, { ...metadata, verifiedBy: '' });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(' ')).toMatch(/verifiedBy is required/);
  });

  it('promotes a valid record only after review status is ready', () => {
    const staged = validateStagedRecord(createStagedRecord());
    const result = promoteStagedRecord(staged, metadata);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.provenance.verified).toBe(true);
      expect(result.record.provenance.verifiedBy).toBe(metadata.verifiedBy);
      expect(result.record.provenance.verifiedDate).toBe(metadata.verifiedDate);
    }
  });

  it('preserves the original manufacturer values and source units exactly', () => {
    const staged = validateStagedRecord(createStagedRecord());
    const result = promoteStagedRecord(staged, metadata);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { provenance: stagedProvenance, interpolation: _stagedPolicy, ...stagedValues } = staged.draft;
    const { provenance: promotedProvenance, interpolation: promotedPolicy, ...promotedValues } = result.record;
    void _stagedPolicy;
    expect(promotedValues).toEqual(stagedValues);
    expect(result.record.thickness).toEqual(staged.draft.thickness);
    expect(result.record.wireDiameter).toEqual(staged.draft.wireDiameter);
    expect(result.record.wireFeed).toEqual(staged.draft.wireFeed);
    expect(promotedProvenance.verified).toBe(true);
    expect(stagedProvenance.verified).toBe(false);
    expect(promotedPolicy).toBe('prohibited');
  });
});
