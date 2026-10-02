export const WELDING_PROCESSES = ['GMAW', 'FCAW', 'GTAW', 'SMAW'] as const;
export type WeldingProcess = (typeof WELDING_PROCESSES)[number];

export const BASE_MATERIALS = ['carbon-steel', 'stainless-steel', 'aluminum'] as const;
export type BaseMaterial = (typeof BASE_MATERIALS)[number];

export const JOINT_TYPES = ['butt', 'lap', 't-joint', 'corner'] as const;
export type JointType = (typeof JOINT_TYPES)[number];

export const WELD_POSITIONS = ['flat', 'horizontal', 'vertical', 'overhead'] as const;
export type WeldPosition = (typeof WELD_POSITIONS)[number];

export type Polarity = 'DCEP' | 'DCEN' | 'AC';

export const GMAW_TRANSFER_MODES = ['short-circuit', 'globular', 'spray', 'pulsed-spray'] as const;
export type GmawTransferMode = (typeof GMAW_TRANSFER_MODES)[number];

/** Shielding gas identifiers. Labels/compositions live in data/catalog.ts. */
export const SHIELDING_GASES = [
  'ar-100',
  'co2-100',
  'ar75-co2-25',
  'ar90-co2-10',
  'ar92-co2-8',
  'ar95-co2-5',
  'ar98-o2-2',
  'ar98-co2-2',
  'he90-ar7.5-co2-2.5',
  'ar75-he25',
] as const;
export type ShieldingGasId = (typeof SHIELDING_GASES)[number];

export interface SourceReference {
  /** e.g. manufacturer or standards body. */
  readonly publisher: string;
  /** Document title, chart name, or product data sheet. */
  readonly document: string;
  readonly edition?: string;
  readonly publicationDate?: string;
  readonly page?: string;
  readonly tableOrChart?: string;
  readonly url?: string;
  readonly accessedDate?: string;
  readonly notes?: string;
}

export type InterpolationPolicy = 'prohibited' | 'linear';

export interface Provenance {
  readonly verified: boolean;
  readonly source: SourceReference;
  /** Required when verified is true. */
  readonly verifiedBy?: string;
  /** ISO date (YYYY-MM-DD). Required when verified is true. */
  readonly verifiedDate?: string;
}
