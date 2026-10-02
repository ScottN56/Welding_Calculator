import { describe, expect, it } from 'vitest';
import { VERIFIED_RECORD_SOURCES } from '../../src/features/welding/data/registry';
import { validateRecordSources } from '../../src/features/welding/data/validate';

describe('production welding data', () => {
  it('contains only structurally valid, verified records', () => {
    expect(validateRecordSources(VERIFIED_RECORD_SOURCES)).toEqual([]);

    const unverified = VERIFIED_RECORD_SOURCES.filter((record) => !record.provenance.verified);
    expect(unverified.map((record) => record.id)).toEqual([]);
  });

  it('requires verifier metadata on every released record', () => {
    for (const record of VERIFIED_RECORD_SOURCES) {
      expect(record.provenance.verified).toBe(true);
      expect(record.provenance.verifiedBy?.trim()).toBeTruthy();
      expect(record.provenance.verifiedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
