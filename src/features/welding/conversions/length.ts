import type { LengthUnit } from '../types';

/** Exact by definition (international inch). */
export const MM_PER_INCH = 25.4;

export function inchesToMm(inches: number): number {
  return inches * MM_PER_INCH;
}

export function mmToInches(mm: number): number {
  return mm / MM_PER_INCH;
}

export function lengthToMm(value: number, unit: LengthUnit): number {
  return unit === 'in' ? inchesToMm(value) : value;
}

export function mmToLength(mm: number, unit: LengthUnit): number {
  return unit === 'in' ? mmToInches(mm) : mm;
}
