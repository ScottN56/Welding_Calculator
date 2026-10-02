import type { FlowUnit, LengthUnit, Range, UnitSystem, WireFeedUnit } from '../types';
import { lpmToFlow } from './flow';
import { exactFraction, formatFraction } from './fractions';
import { mmToInches } from './length';
import { mmPerMinToWireFeed } from './wireFeed';

export interface DisplayUnits {
  readonly length: LengthUnit;
  readonly flow: FlowUnit;
  readonly wireFeed: WireFeedUnit;
}

export const DISPLAY_UNITS: Readonly<Record<UnitSystem, DisplayUnits>> = {
  imperial: { length: 'in', flow: 'cfh', wireFeed: 'ipm' },
  // Metric machines conventionally display wire feed in m/min.
  metric: { length: 'mm', flow: 'lpm', wireFeed: 'm/min' },
};

const UNIT_LABELS: Readonly<Record<FlowUnit | WireFeedUnit, string>> = {
  cfh: 'CFH',
  lpm: 'L/min',
  ipm: 'IPM',
  'm/min': 'm/min',
  'mm/min': 'mm/min',
};

/** Rounds half away from zero to maxDecimals and trims trailing zeros. */
export function formatNumber(value: number, maxDecimals: number): string {
  // Small epsilon corrects binary representation error (6.35 is stored as 6.3499999…).
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(value * factor * (1 + Number.EPSILON * 4)) / factor;
  const fixed = rounded.toFixed(maxDecimals);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

export function formatRange(range: Range, maxDecimals: number, unitLabel: string): string {
  const min = formatNumber(range.min, maxDecimals);
  const max = formatNumber(range.max, maxDecimals);
  return min === max ? `${min} ${unitLabel}` : `${min}–${max} ${unitLabel}`;
}

export function formatThickness(mm: number, system: UnitSystem): string {
  if (system === 'metric') return `${formatNumber(mm, 2)} mm`;
  const inches = mmToInches(mm);
  const fraction = exactFraction(inches);
  return fraction ? `${formatFraction(fraction)}"` : `${formatNumber(inches, 3)}"`;
}

export function formatThicknessRange(range: Range, system: UnitSystem): string {
  const min = formatThickness(range.min, system);
  const max = formatThickness(range.max, system);
  return min === max ? min : `${min} – ${max}`;
}

/** Editable text for a thickness field (no unit symbol), e.g. "1/4" or "6.35". */
export function thicknessInputText(mm: number, system: UnitSystem): string {
  if (!Number.isFinite(mm)) return '';
  if (system === 'metric') return formatNumber(mm, 2);
  const inches = mmToInches(mm);
  const fraction = exactFraction(inches);
  return fraction ? formatFraction(fraction) : formatNumber(inches, 4);
}

export function formatDiameter(mm: number, system: UnitSystem): string {
  return system === 'metric' ? `${formatNumber(mm, 2)} mm` : `${mmToInches(mm).toFixed(3)}"`;
}

export function formatVoltage(range: Range): string {
  return formatRange(range, 1, 'V');
}

export function formatAmperage(range: Range): string {
  return formatRange(range, 0, 'A');
}

export function formatWireFeed(rangeMmPerMin: Range, system: UnitSystem): string {
  const unit = DISPLAY_UNITS[system].wireFeed;
  const converted = {
    min: mmPerMinToWireFeed(rangeMmPerMin.min, unit),
    max: mmPerMinToWireFeed(rangeMmPerMin.max, unit),
  };
  return formatRange(converted, unit === 'ipm' ? 0 : 1, UNIT_LABELS[unit]);
}

export function formatGasFlow(rangeLpm: Range, system: UnitSystem): string {
  const unit = DISPLAY_UNITS[system].flow;
  const converted = { min: lpmToFlow(rangeLpm.min, unit), max: lpmToFlow(rangeLpm.max, unit) };
  return formatRange(converted, unit === 'cfh' ? 0 : 1, UNIT_LABELS[unit]);
}
