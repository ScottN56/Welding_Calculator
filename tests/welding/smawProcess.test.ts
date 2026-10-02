import { describe, expect, it } from 'vitest';
import type { Polarity, SmawRecord } from '../../src/features/welding/types';
import {
  getProcessDefinition,
} from '../../src/features/welding/processes';
import { VERIFIED_RECORD_SOURCES } from '../../src/features/welding/data/registry';
import { smawDefinition } from '../../src/features/welding/processes/smaw';

function recordWithCompatibility(currentCompatibility: readonly Polarity[]): SmawRecord {
  return { currentCompatibility } as SmawRecord;
}

describe('SMAW process definition', () => {
  it('is registered', () => {
    const definition =
      getProcessDefinition('SMAW');

    expect(definition).toBeDefined();
    expect(definition?.process).toBe('SMAW');
  });

  it('has no production records yet', () => {
    expect(VERIFIED_RECORD_SOURCES.filter((record) => record.process === 'SMAW')).toHaveLength(0);
  });

  it('compares current compatibility by value, independent of array order', () => {
    const field = smawDefinition.categoricalFields.find((candidate) => candidate.key === 'currentCompatibility');
    expect(field?.equals).toBeDefined();
    if (!field?.equals) return;

    expect(
      field.equals(
        recordWithCompatibility(['AC', 'DCEP']),
        recordWithCompatibility(['DCEP', 'AC']),
      ),
    ).toBe(true);
    expect(
      field.equals(
        recordWithCompatibility(['AC', 'DCEP']),
        recordWithCompatibility(['DCEN']),
      ),
    ).toBe(false);
  });
});
