import { COMMON_THICKNESSES_IN, COMMON_THICKNESSES_MM } from './data/catalog';
import { inchesToMm, parseInches } from './conversions';
import type { UnitSystem } from './types';

/** Common sizes for the selected unit system, in mm, ascending. */
export function commonThicknessesMm(system: UnitSystem): number[] {
  if (system === 'metric') return [...COMMON_THICKNESSES_MM];
  return COMMON_THICKNESSES_IN.map((text) => {
    const inches = parseInches(text);
    if (inches === null) throw new Error(`Invalid preset thickness: ${text}`);
    return inchesToMm(inches);
  });
}

/** Next larger (+1) or smaller (-1) common size; stays put at either end. */
export function stepThickness(currentMm: number, direction: 1 | -1, system: UnitSystem): number {
  const sizes = commonThicknessesMm(system);
  const epsilon = 1e-6;
  if (direction === 1) return sizes.find((s) => s > currentMm + epsilon) ?? currentMm;
  return [...sizes].reverse().find((s) => s < currentMm - epsilon) ?? currentMm;
}
