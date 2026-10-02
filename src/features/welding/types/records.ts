import type {
  BaseMaterial,
  GmawTransferMode,
  InterpolationPolicy,
  JointType,
  Polarity,
  Provenance,
  ShieldingGasId,
  WeldPosition,
} from './common';
import type { FlowUnit, LengthUnit, Measured, MeasuredRange, Range, WireFeedUnit } from './units';

/*
 * Two layers of record types:
 *  - *RecordSource: what a person enters from a reference chart, in the chart's own units.
 *  - *Record: normalized to canonical units (mm, mm/min, L/min) and consumed by the engine.
 */

export type Applicability<T> = readonly T[] | 'all';

interface RecordSourceBase {
  readonly id: string;
  readonly material: BaseMaterial;
  readonly thickness: MeasuredRange<LengthUnit>;
  readonly joints: Applicability<JointType>;
  readonly positions: Applicability<WeldPosition>;
  readonly interpolation?: InterpolationPolicy;
  readonly passes?: Range;
  readonly notes?: readonly string[];
  readonly provenance: Provenance;
}

export interface GmawRecordSource extends RecordSourceBase {
  readonly process: 'GMAW';
  readonly wireClass: string;
  readonly wireDiameter: Measured<LengthUnit>;
  readonly gas: ShieldingGasId;
  readonly transferMode: GmawTransferMode;
  readonly polarity: Polarity;
  readonly voltage: Range;
  readonly wireFeed: MeasuredRange<WireFeedUnit>;
  readonly amperage?: Range;
  readonly gasFlow?: MeasuredRange<FlowUnit>;
}

export interface FcawRecordSource extends RecordSourceBase {
  readonly process: 'FCAW';
  readonly wireClass: string;
  readonly wireDiameter: Measured<LengthUnit>;
  readonly shielding: ShieldingGasId | 'self-shielded';
  readonly polarity: Polarity;
  readonly voltage: Range;
  readonly wireFeed: MeasuredRange<WireFeedUnit>;
  readonly amperage?: Range;
  readonly gasFlow?: MeasuredRange<FlowUnit>;
}

export interface GtawRecordSource extends RecordSourceBase {
  readonly process: 'GTAW';
  readonly current: 'AC' | 'DC';
  readonly polarity: Polarity;
  readonly amperage: Range;
  readonly tungstenType: string;
  readonly tungstenDiameter: Measured<LengthUnit>;
  readonly fillerClass?: string;
  readonly fillerDiameter?: Measured<LengthUnit>;
  readonly gas: ShieldingGasId;
  readonly gasFlow?: MeasuredRange<FlowUnit>;
  /** Percent electrode-negative. */
  readonly acBalance?: Range;
  /** Hz. */
  readonly acFrequency?: Range;
}

export interface SmawRecordSource extends RecordSourceBase {
  readonly process: 'SMAW';
  readonly electrodeClass: string;
  readonly electrodeDiameter: Measured<LengthUnit>;
  readonly currentCompatibility: readonly Polarity[];
  readonly polarity: Polarity;
  readonly amperage: Range;
}

export type WeldingRecordSource =
  | GmawRecordSource
  | FcawRecordSource
  | GtawRecordSource
  | SmawRecordSource;

interface NormalizedRecordBase {
  readonly id: string;
  readonly material: BaseMaterial;
  readonly thicknessMm: Range;
  readonly joints: Applicability<JointType>;
  readonly positions: Applicability<WeldPosition>;
  readonly interpolationPermitted: boolean;
  readonly passes: Range | undefined;
  readonly notes: readonly string[];
  readonly provenance: Provenance;
}

export interface GmawRecord extends NormalizedRecordBase {
  readonly process: 'GMAW';
  readonly wireClass: string;
  readonly wireDiameterMm: number;
  readonly gas: ShieldingGasId;
  readonly transferMode: GmawTransferMode;
  readonly polarity: Polarity;
  readonly voltage: Range;
  readonly wireFeedMmPerMin: Range;
  readonly amperage: Range | undefined;
  readonly gasFlowLpm: Range | undefined;
}

export interface FcawRecord extends NormalizedRecordBase {
  readonly process: 'FCAW';
  readonly wireClass: string;
  readonly wireDiameterMm: number;
  readonly shielding: ShieldingGasId | 'self-shielded';
  readonly polarity: Polarity;
  readonly voltage: Range;
  readonly wireFeedMmPerMin: Range;
  readonly amperage: Range | undefined;
  readonly gasFlowLpm: Range | undefined;
}

export interface GtawRecord extends NormalizedRecordBase {
  readonly process: 'GTAW';
  readonly current: 'AC' | 'DC';
  readonly polarity: Polarity;
  readonly amperage: Range;
  readonly tungstenType: string;
  readonly tungstenDiameterMm: number;
  readonly fillerClass: string | undefined;
  readonly fillerDiameterMm: number | undefined;
  readonly gas: ShieldingGasId;
  readonly gasFlowLpm: Range | undefined;
  readonly acBalance: Range | undefined;
  readonly acFrequency: Range | undefined;
}

export interface SmawRecord extends NormalizedRecordBase {
  readonly process: 'SMAW';
  readonly electrodeClass: string;
  readonly electrodeDiameterMm: number;
  readonly currentCompatibility: readonly Polarity[];
  readonly polarity: Polarity;
  readonly amperage: Range;
}

export type WeldingRecord = GmawRecord | FcawRecord | GtawRecord | SmawRecord;

export interface RecordByProcess {
  GMAW: GmawRecord;
  FCAW: FcawRecord;
  GTAW: GtawRecord;
  SMAW: SmawRecord;
}

/** Keys of R whose values are numeric ranges (eligible for interpolation). */
export type RangeKey<R> = {
  [K in keyof R]-?: R[K] extends Range | undefined ? (K extends 'thicknessMm' | 'passes' ? never : K) : never;
}[keyof R];
