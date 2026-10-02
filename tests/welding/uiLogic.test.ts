import { describe, expect, it } from 'vitest';
import { reconcileConsumables } from '../../src/features/welding/calculations';
import { inchesToMm } from '../../src/features/welding/conversions';
import { gmawDefinition } from '../../src/features/welding/processes/gmaw';
import { commonThicknessesMm, stepThickness } from '../../src/features/welding/thicknessPresets';
import { ANY_OPTION } from '../../src/features/welding/types';
import { gmaw, input, METRIC } from './fixtures';

describe('reconcileConsumables', () => {
  const records = [
    gmaw({ id: 'steel', wireClass: 'WIRE-A' }),
    gmaw({ id: 'alu', material: 'aluminum', wireClass: 'WIRE-AL', gas: 'ar-100', transferMode: 'spray' }),
  ];

  it('fills empty selections with the first available option and ANY for optional fields', () => {
    const { input: next } = reconcileConsumables(gmawDefinition, records, input({ consumable: {} }), METRIC);
    expect(next.consumable).toEqual({ wireClass: 'WIRE-A', wireDiameter: '0.900', gas: 'ar75-co2-25', transferMode: ANY_OPTION });
  });

  it('replaces selections that become unavailable after a material change', () => {
    const { input: next, optionsByField } = reconcileConsumables(gmawDefinition, records, input({ material: 'aluminum' }), METRIC);
    expect(next.consumable.wireClass).toBe('WIRE-AL');
    expect(next.consumable.gas).toBe('ar-100');
    expect(optionsByField.gas?.map((o) => o.value)).toEqual(['ar-100']);
  });

  it('keeps valid selections untouched', () => {
    const original = input();
    const { input: next } = reconcileConsumables(gmawDefinition, records, original, METRIC);
    expect(next.consumable).toEqual(original.consumable);
  });

  it('removes required selections when nothing is available', () => {
    const { input: next } = reconcileConsumables(gmawDefinition, records, input({ material: 'stainless-steel' }), METRIC);
    expect(next.consumable.wireClass).toBeUndefined();
  });
});

describe('thickness presets', () => {
  it('lists ascending common sizes', () => {
    for (const system of ['imperial', 'metric'] as const) {
      const sizes = commonThicknessesMm(system);
      expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    }
  });

  it('steps between common sizes and stops at the ends', () => {
    expect(stepThickness(inchesToMm(1 / 8), 1, 'imperial')).toBeCloseTo(inchesToMm(5 / 32), 10);
    expect(stepThickness(inchesToMm(1 / 8), -1, 'imperial')).toBeCloseTo(inchesToMm(3 / 32), 10);
    expect(stepThickness(4.2, 1, 'metric')).toBe(5);
    expect(stepThickness(4.2, -1, 'metric')).toBe(4);
    expect(stepThickness(1, -1, 'metric')).toBe(1);
    expect(stepThickness(25, 1, 'metric')).toBe(25);
  });
});
