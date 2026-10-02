import { normalizeRecord } from '../../src/features/welding/data/normalize';
import type { CalculatorInput, GmawRecord, GmawRecordSource } from '../../src/features/welding/types';

// Test-only fixtures. Numbers are arbitrary and chosen for easy arithmetic.

export const TEST_PROVENANCE = {
  verified: true,
  source: { publisher: 'Test Fixture', document: 'Unit test data' },
  verifiedBy: 'test',
  verifiedDate: '2026-01-01',
} as const;

export function gmawSource(overrides: Partial<GmawRecordSource> = {}): GmawRecordSource {
  return {
    id: 'fx',
    process: 'GMAW',
    material: 'carbon-steel',
    thickness: { min: 2, max: 3, unit: 'mm' },
    joints: 'all',
    positions: 'all',
    interpolation: { allowed: true, rationale: 'Unit-test fixture explicitly allows interpolation.' },
    wireClass: 'WIRE-A',
    wireDiameter: { value: 0.9, unit: 'mm' },
    gas: 'ar75-co2-25',
    transferMode: 'short-circuit',
    polarity: 'DCEP',
    voltage: { min: 10, max: 20 },
    wireFeed: { min: 1000, max: 2000, unit: 'mm/min' },
    amperage: { min: 100, max: 200 },
    gasFlow: { min: 10, max: 20, unit: 'lpm' },
    provenance: TEST_PROVENANCE,
    ...overrides,
  };
}

export function gmaw(overrides: Partial<GmawRecordSource> = {}): GmawRecord {
  return normalizeRecord(gmawSource(overrides)) as GmawRecord;
}

/** Three bands on WIRE-A 0.9 mm: [2,3] [5,5] [8,10] mm, with gaps (3,5) and (5,8). */
export function bandedRecords(): GmawRecord[] {
  return [
    gmaw({ id: 'a', thickness: { min: 2, max: 3, unit: 'mm' }, voltage: { min: 10, max: 20 }, wireFeed: { min: 1000, max: 2000, unit: 'mm/min' } }),
    gmaw({ id: 'b', thickness: { min: 5, max: 5, unit: 'mm' }, voltage: { min: 20, max: 30 }, wireFeed: { min: 3000, max: 4000, unit: 'mm/min' } }),
    gmaw({ id: 'c', thickness: { min: 8, max: 10, unit: 'mm' }, voltage: { min: 30, max: 40 }, wireFeed: { min: 5000, max: 6000, unit: 'mm/min' } }),
  ];
}

export function input(overrides: Partial<CalculatorInput> = {}): CalculatorInput {
  return {
    process: 'GMAW',
    material: 'carbon-steel',
    thicknessMm: 2.5,
    joint: 'butt',
    position: 'flat',
    consumable: { wireClass: 'WIRE-A', wireDiameter: '0.900', gas: 'ar75-co2-25', transferMode: 'any' },
    ...overrides,
  };
}

export const METRIC = { unitSystem: 'metric', includeUnverified: true } as const;
