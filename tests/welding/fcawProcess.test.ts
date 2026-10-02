import { describe, expect, it } from 'vitest';

import {
  getProcessDefinition,
} from '../../src/features/welding/processes';
import { VERIFIED_RECORD_SOURCES } from '../../src/features/welding/data/registry';

describe('FCAW process definition', () => {
  it('is registered', () => {
    const definition =
      getProcessDefinition('FCAW');

    expect(definition).toBeDefined();
    expect(definition?.process).toBe('FCAW');
  });

  it('has no production records yet', () => {
    expect(VERIFIED_RECORD_SOURCES.filter((record) => record.process === 'FCAW')).toHaveLength(0);
  });
});
