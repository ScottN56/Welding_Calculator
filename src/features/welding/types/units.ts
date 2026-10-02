export type UnitSystem = 'imperial' | 'metric';

export type LengthUnit = 'in' | 'mm';
export type FlowUnit = 'cfh' | 'lpm';
export type WireFeedUnit = 'ipm' | 'mm/min' | 'm/min';

/** Inclusive numeric range. Units are implied by the field name or a sibling `unit`. */
export interface Range {
  readonly min: number;
  readonly max: number;
}

export interface MeasuredRange<U extends string> extends Range {
  readonly unit: U;
}

export interface Measured<U extends string> {
  readonly value: number;
  readonly unit: U;
}
