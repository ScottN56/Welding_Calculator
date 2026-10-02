import type { FlowUnit } from '../types';

/** 1 ft³ = 28.316846592 L (exact); per hour → per minute. */
export const LPM_PER_CFH = 28.316846592 / 60;

export function cfhToLpm(cfh: number): number {
  return cfh * LPM_PER_CFH;
}

export function lpmToCfh(lpm: number): number {
  return lpm / LPM_PER_CFH;
}

export function flowToLpm(value: number, unit: FlowUnit): number {
  return unit === 'cfh' ? cfhToLpm(value) : value;
}

export function lpmToFlow(lpm: number, unit: FlowUnit): number {
  return unit === 'cfh' ? lpmToCfh(lpm) : lpm;
}
