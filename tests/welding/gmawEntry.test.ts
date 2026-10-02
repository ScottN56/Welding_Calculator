import { describe, expect, it } from 'vitest';
import { emptyGmawEntryForm, markGmawEntryForReview, validateGmawEntry } from '../../src/features/welding/data/staging/gmawEntry';
import { gmawSource } from './fixtures';

function validEntry() {
  const source = gmawSource();
  return {
    ...emptyGmawEntryForm(),
    recordId: source.id,
    material: source.material,
    thicknessMin: String(source.thickness.min),
    thicknessMax: String(source.thickness.max),
    thicknessUnit: source.thickness.unit,
    joints: ['butt'],
    positions: ['flat'],
    wireClass: source.wireClass,
    wireDiameter: String(source.wireDiameter.value),
    wireDiameterUnit: source.wireDiameter.unit,
    gas: source.gas,
    transferMode: source.transferMode,
    polarity: source.polarity,
    voltageMin: String(source.voltage.min),
    voltageMax: String(source.voltage.max),
    wireFeedMin: String(source.wireFeed.min),
    wireFeedMax: String(source.wireFeed.max),
    wireFeedUnit: source.wireFeed.unit,
    sourceDatasetId: 'fictional-entry-dataset',
    publisher: source.provenance.source.publisher,
    document: source.provenance.source.document,
    reviewerNotes: 'Fictional fixture only.',
  };
}

describe('manual staged GMAW entry', () => {
  it('starts blank without welding values, units or applicability defaults', () => {
    const form = emptyGmawEntryForm();
    expect(Object.values(form).every((value) => Array.isArray(value) ? value.length === 0 : value === '')).toBe(true);
    expect(markGmawEntryForReview(form).ok).toBe(false);
  });

  it('preserves source values and units and keeps provenance unverified', () => {
    const source = gmawSource();
    const form = validEntry();
    const snapshot = structuredClone(form);
    const result = validateGmawEntry(form);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.staged.draft.thickness).toEqual(source.thickness);
    expect(result.staged.draft.wireDiameter).toEqual(source.wireDiameter);
    expect(result.staged.draft.voltage).toEqual(source.voltage);
    expect(result.staged.draft.wireFeed).toEqual(source.wireFeed);
    expect(result.staged.draft.amperage).toBeUndefined();
    expect(result.staged.draft.gasFlow).toBeUndefined();
    expect(result.staged.draft.provenance.verified).toBe(false);
    expect(result.staged.reviewStatus).toBe('draft');
    expect(form).toEqual(snapshot);
  });

  it('requires units to be selected rather than guessing them', () => {
    const result = validateGmawEntry({ ...validEntry(), wireFeedUnit: '' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(' ')).toContain('wireFeedUnit');
  });

  it('requires both optional range endpoints when either is supplied', () => {
    const result = validateGmawEntry({ ...validEntry(), amperageMin: String(gmawSource().amperage!.min) });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(' ')).toContain('amperageMax');
  });

  it('does not correct an invalid range or mark it for review', () => {
    const source = gmawSource();
    const result = markGmawEntryForReview({
      ...validEntry(), voltageMin: String(source.voltage.max), voltageMax: String(source.voltage.min),
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(' ')).toContain('voltage');
  });

  it('marks valid data needs-review without verifying or preparing automatic promotion', () => {
    const result = markGmawEntryForReview(validEntry());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.staged.reviewStatus).toBe('needs-review');
    expect(result.staged.draft.provenance.verified).toBe(false);
    expect(result.staged.draft.provenance.verifiedBy).toBeUndefined();
    expect(result.staged.draft.provenance.verifiedDate).toBeUndefined();
  });

  it('does not accept non-decimal numeric input or missing source metadata', () => {
    const result = validateGmawEntry({ ...validEntry(), voltageMin: '0x10', publisher: '' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(' ')).toContain('voltageMin');
    expect(!result.ok && result.errors.join(' ')).toContain('publisher');
  });
});