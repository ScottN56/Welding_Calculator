import { describe, expect, it } from 'vitest';

import {
  getProcessDefinition,
} from '../../src/features/welding/processes';
import { VERIFIED_RECORD_SOURCES } from '../../src/features/welding/data/registry';

describe('GTAW process definition', () => {
  it('is registered', () => {
    const definition =
      getProcessDefinition('GTAW');

    expect(definition).toBeDefined();
    expect(definition?.process).toBe('GTAW');
  });

  it('has no production records yet', () => {
    expect(VERIFIED_RECORD_SOURCES.filter((record) => record.process === 'GTAW')).toHaveLength(0);
  });
});