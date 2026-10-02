import type {
  BaseMaterial,
  GmawTransferMode,
  JointType,
  Polarity,
  ShieldingGasId,
  WeldingProcess,
  WeldPosition,
} from '../types';

// Display labels and standard size lists only. No welding parameters belong in this file.

export const PROCESS_LABELS: Readonly<Record<WeldingProcess, { readonly short: string; readonly long: string }>> = {
  GMAW: { short: 'MIG', long: 'GMAW / MIG' },
  FCAW: { short: 'Flux-Core', long: 'FCAW / Flux-Core' },
  GTAW: { short: 'TIG', long: 'GTAW / TIG' },
  SMAW: { short: 'Stick', long: 'SMAW / Stick' },
};

export const MATERIAL_LABELS: Readonly<Record<BaseMaterial, string>> = {
  'carbon-steel': 'Mild / Carbon Steel',
  'stainless-steel': 'Stainless Steel',
  aluminum: 'Aluminum',
};

export const MATERIAL_SHORT_LABELS: Readonly<Record<BaseMaterial, string>> = {
  'carbon-steel': 'Mild Steel',
  'stainless-steel': 'Stainless',
  aluminum: 'Aluminum',
};

export const JOINT_LABELS: Readonly<Record<JointType, string>> = {
  butt: 'Butt',
  lap: 'Lap',
  't-joint': 'T-Joint',
  corner: 'Corner',
};

export const POSITION_LABELS: Readonly<Record<WeldPosition, string>> = {
  flat: 'Flat',
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  overhead: 'Overhead',
};

export const POLARITY_LABELS: Readonly<Record<Polarity, string>> = {
  DCEP: 'DCEP (Electrode Positive)',
  DCEN: 'DCEN (Electrode Negative)',
  AC: 'AC',
};

export const TRANSFER_MODE_LABELS: Readonly<Record<GmawTransferMode, string>> = {
  'short-circuit': 'Short-Circuit',
  globular: 'Globular',
  spray: 'Spray',
  'pulsed-spray': 'Pulsed Spray',
};

/** Gas compositions by volume. */
export const GAS_LABELS: Readonly<Record<ShieldingGasId, string>> = {
  'ar-100': '100% Argon',
  'co2-100': '100% CO₂',
  'ar75-co2-25': '75% Ar / 25% CO₂ (C25)',
  'ar90-co2-10': '90% Ar / 10% CO₂ (C10)',
  'ar92-co2-8': '92% Ar / 8% CO₂',
  'ar95-co2-5': '95% Ar / 5% CO₂',
  'ar98-o2-2': '98% Ar / 2% O₂',
  'ar98-co2-2': '98% Ar / 2% CO₂',
  'he90-ar7.5-co2-2.5': '90% He / 7.5% Ar / 2.5% CO₂ (Tri-Mix)',
  'ar75-he25': '75% Ar / 25% He',
};

/** Common plate/sheet sizes offered as quick picks. */
export const COMMON_THICKNESSES_IN: readonly string[] = [
  '1/16', '5/64', '3/32', '1/8', '5/32', '3/16', '1/4', '5/16', '3/8', '1/2', '5/8', '3/4', '1',
];

export const COMMON_THICKNESSES_MM: readonly number[] = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25];
