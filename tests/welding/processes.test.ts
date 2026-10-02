import { describe, expect, it } from 'vitest';
import { VERIFIED_RECORD_SOURCES, registry } from '../../src/features/welding/data/registry';
import { getAnyProcessDefinition } from '../../src/features/welding/processes';

describe('process definitions', () => {
  it('keeps GMAW usable in development through its sample records', () => {
    expect(getAnyProcessDefinition('GMAW')?.process).toBe('GMAW');
    expect(registry.forProcess('GMAW').length).toBeGreaterThan(0);
  });

  it('registers GTAW with no production records yet', () => {
    expect(getAnyProcessDefinition('GTAW')?.process).toBe('GTAW');
    expect(VERIFIED_RECORD_SOURCES.filter((record) => record.process === 'GTAW')).toHaveLength(0);
  });
});