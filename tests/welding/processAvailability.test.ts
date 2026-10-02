import { describe, expect, it } from 'vitest';
import { getProcessStatus } from '../../src/features/welding/processes';

describe('getProcessStatus', () => {
  it('reports a registered process with records as available', () => {
    expect(getProcessStatus(true, 1)).toBe('available');
  });

  it('reports a registered process without records as no-data', () => {
    expect(getProcessStatus(true, 0)).toBe('no-data');
  });

  it('reports a process without a definition as not-implemented', () => {
    expect(getProcessStatus(false, 0)).toBe('not-implemented');
  });
});