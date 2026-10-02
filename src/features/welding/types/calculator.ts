import type { BaseMaterial, JointType, WeldingProcess, WeldPosition } from './common';
import type { WeldingRecord } from './records';
import type { Range, UnitSystem } from './units';

/** Sentinel for an optional consumable selection meaning "no preference". */
export const ANY_OPTION = 'any';

export interface CalculatorInput {
  readonly process: WeldingProcess;
  readonly material: BaseMaterial;
  /** Canonical unit: millimetres. */
  readonly thicknessMm: number;
  readonly joint: JointType;
  readonly position: WeldPosition;
  /** Keyed by the process definition's consumable field keys; values are canonical option keys. */
  readonly consumable: Readonly<Record<string, string>>;
}

export interface RecommendOptions {
  readonly unitSystem: UnitSystem;
  readonly includeUnverified: boolean;
}

export type DataQuality = 'verified' | 'unverified';

interface ResultMessages {
  /** How the result was selected, in plain language. */
  readonly explanation: readonly string[];
  readonly warnings: readonly string[];
}

export interface RecommendationFound<R extends WeldingRecord> extends ResultMessages {
  readonly status: 'exact' | 'interpolated';
  /** Values to display. For interpolated results this is a synthesized record. */
  readonly values: R;
  readonly sources: readonly R[];
  readonly dataQuality: DataQuality;
}

export interface RecommendationOutOfRange<R extends WeldingRecord> extends ResultMessages {
  readonly status: 'out-of-range';
  readonly direction: 'below-min' | 'above-max';
  readonly supportedRangeMm: Range;
  readonly nearest: R;
}

/** Thickness falls between records that cannot be safely interpolated (e.g. different transfer modes). */
export interface RecommendationGap<R extends WeldingRecord> extends ResultMessages {
  readonly status: 'gap';
  readonly lower: R;
  readonly upper: R;
}

/** Several records apply and differ in a setting the user must choose. */
export interface RecommendationAmbiguous<R extends WeldingRecord> extends ResultMessages {
  readonly status: 'ambiguous';
  readonly candidates: readonly R[];
  readonly differingFields: readonly string[];
}

export type FilterStage = 'process' | 'verification' | 'material' | 'joint' | 'position' | 'consumable';

export interface RecommendationUnsupported extends ResultMessages {
  readonly status: 'unsupported';
  readonly stage: FilterStage;
  /** Consumable field key when stage === 'consumable'. */
  readonly field?: string;
}

export interface RecommendationInvalidInput extends ResultMessages {
  readonly status: 'invalid-input';
  readonly errors: readonly string[];
}

export type RecommendationResult<R extends WeldingRecord> =
  | RecommendationFound<R>
  | RecommendationOutOfRange<R>
  | RecommendationGap<R>
  | RecommendationAmbiguous<R>
  | RecommendationUnsupported
  | RecommendationInvalidInput;
