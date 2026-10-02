import {
  BASE_MATERIALS,
  GMAW_TRANSFER_MODES,
  JOINT_TYPES,
  SHIELDING_GASES,
  WELD_POSITIONS,
  type GmawRecordSource,
  type Range,
} from '../../types';
import type { StagedWeldingRecord } from './types';
import { validateStagedRecord } from './validateStagedRecord';

export const GMAW_ENTRY_FIELDS = [
  ['recordId', 'Record ID'],
  ['material', 'Material', BASE_MATERIALS],
  ['thicknessMin', 'Thickness minimum'],
  ['thicknessMax', 'Thickness maximum'],
  ['thicknessUnit', 'Thickness unit', ['in', 'mm']],
  ['wireClass', 'Wire class'],
  ['wireDiameter', 'Wire diameter'],
  ['wireDiameterUnit', 'Wire diameter unit', ['in', 'mm']],
  ['gas', 'Shielding gas', SHIELDING_GASES],
  ['transferMode', 'Transfer mode', GMAW_TRANSFER_MODES],
  ['polarity', 'Polarity', ['DCEP', 'DCEN', 'AC']],
  ['voltageMin', 'Voltage minimum (V)'],
  ['voltageMax', 'Voltage maximum (V)'],
  ['wireFeedMin', 'Wire feed minimum'],
  ['wireFeedMax', 'Wire feed maximum'],
  ['wireFeedUnit', 'Wire feed unit', ['ipm', 'mm/min', 'm/min']],
  ['amperageMin', 'Amperage minimum (A, optional)'],
  ['amperageMax', 'Amperage maximum (A, optional)'],
  ['gasFlowMin', 'Gas flow minimum (optional)'],
  ['gasFlowMax', 'Gas flow maximum (optional)'],
  ['gasFlowUnit', 'Gas flow unit', ['cfh', 'lpm']],
  ['sourceDatasetId', 'Source dataset ID'],
  ['publisher', 'Source publisher'],
  ['document', 'Source document'],
  ['page', 'Source page (optional)'],
  ['tableOrChart', 'Source table/chart (optional)'],
] as const;

type EntryKey = (typeof GMAW_ENTRY_FIELDS)[number][0];
export type GmawEntryForm = Record<EntryKey, string> & {
  joints: string[];
  positions: string[];
  reviewerNotes: string;
};

export function emptyGmawEntryForm(): GmawEntryForm {
  const fields = Object.fromEntries(GMAW_ENTRY_FIELDS.map(([key]) => [key, ''])) as Record<EntryKey, string>;
  return { ...fields, joints: [], positions: [], reviewerNotes: '' };
}

export type GmawEntryResult =
  | { readonly ok: true; readonly staged: StagedWeldingRecord<GmawRecordSource> }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Parses only manually supplied values; no defaults, conversions or estimates are applied. */
export function validateGmawEntry(form: GmawEntryForm): GmawEntryResult {
  const errors: string[] = [];
  const requiredText = (key: EntryKey): string => {
    if (!form[key].trim()) errors.push(`${key}: required`);
    return form[key];
  };
  const numeric = (key: EntryKey): number => {
    const text = form[key].trim();
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) || !Number.isFinite(Number(text))) {
      errors.push(`${key}: enter a finite decimal value exactly as supplied by the source`);
      return Number.NaN;
    }
    return Number(text);
  };
  const selection = <T extends string>(key: EntryKey, options: readonly T[]): T | undefined => {
    const value = options.find((option) => option === form[key]);
    if (value === undefined) errors.push(`${key}: select an explicit source option`);
    return value;
  };
  const applicability = <T extends string>(values: string[], options: readonly T[], label: string): T[] => {
    const selected = options.filter((option) => values.includes(option));
    if (!selected.length || selected.length !== values.length) errors.push(`${label}: select the source applicability`);
    return selected;
  };
  const range = (min: EntryKey, max: EntryKey, optional = false): Range | undefined => {
    if (optional && form[min].trim() === '' && form[max].trim() === '') return undefined;
    return { min: numeric(min), max: numeric(max) };
  };

  const id = requiredText('recordId');
  const sourceDatasetId = requiredText('sourceDatasetId');
  const publisher = requiredText('publisher');
  const document = requiredText('document');
  const material = selection('material', BASE_MATERIALS);
  const thickness = range('thicknessMin', 'thicknessMax');
  const thicknessUnit = selection('thicknessUnit', ['in', 'mm'] as const);
  const joints = applicability(form.joints, JOINT_TYPES, 'joints');
  const positions = applicability(form.positions, WELD_POSITIONS, 'positions');
  const wireClass = requiredText('wireClass');
  const wireDiameter = numeric('wireDiameter');
  const wireDiameterUnit = selection('wireDiameterUnit', ['in', 'mm'] as const);
  const gas = selection('gas', SHIELDING_GASES);
  const transferMode = selection('transferMode', GMAW_TRANSFER_MODES);
  const polarity = selection('polarity', ['DCEP', 'DCEN', 'AC'] as const);
  const voltage = range('voltageMin', 'voltageMax');
  const wireFeed = range('wireFeedMin', 'wireFeedMax');
  const wireFeedUnit = selection('wireFeedUnit', ['ipm', 'mm/min', 'm/min'] as const);
  const amperage = range('amperageMin', 'amperageMax', true);
  const gasFlow = range('gasFlowMin', 'gasFlowMax', true);
  const gasFlowUnit = gasFlow
    ? selection('gasFlowUnit', ['cfh', 'lpm'] as const)
    : undefined;
  if (!gasFlow && form.gasFlowUnit !== '') errors.push('gasFlowUnit: omit when no gas flow values are supplied');

  if (errors.length) return { ok: false, errors };

  const staged = validateStagedRecord<GmawRecordSource>({
    draft: {
      id,
      process: 'GMAW',
      material: material!,
      thickness: { ...thickness!, unit: thicknessUnit! },
      joints,
      positions,
      wireClass,
      wireDiameter: { value: wireDiameter, unit: wireDiameterUnit! },
      gas: gas!,
      transferMode: transferMode!,
      polarity: polarity!,
      voltage: voltage!,
      wireFeed: { ...wireFeed!, unit: wireFeedUnit! },
      ...(amperage === undefined ? {} : { amperage }),
      ...(gasFlow === undefined ? {} : { gasFlow: { ...gasFlow, unit: gasFlowUnit! } }),
      provenance: {
        verified: false,
        source: {
          publisher,
          document,
          ...(form.page.trim() ? { page: form.page } : {}),
          ...(form.tableOrChart.trim() ? { tableOrChart: form.tableOrChart } : {}),
        },
      },
    },
    sourceDatasetId,
    reviewStatus: 'draft',
    reviewerNotes: form.reviewerNotes,
    validationErrors: [],
    readyForVerification: false,
  });

  return staged.validationErrors.length
    ? { ok: false, errors: staged.validationErrors }
    : { ok: true, staged };
}

export function markGmawEntryForReview(form: GmawEntryForm): GmawEntryResult {
  const result = validateGmawEntry(form);
  return result.ok
    ? { ok: true, staged: { ...result.staged, reviewStatus: 'needs-review' } }
    : result;
}