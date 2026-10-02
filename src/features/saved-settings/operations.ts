import {
  DISPLAY_UNITS,
  flowToLpm,
  formatNumber,
  formatRange,
  lpmToFlow,
  mmPerMinToWireFeed,
  wireFeedToMmPerMin,
} from '../welding/conversions';
import type { Range, RecommendationResult, UnitSystem, WeldingRecord } from '../welding/types';
import { BASE_MATERIALS, JOINT_TYPES, WELD_POSITIONS, WELDING_PROCESSES } from '../welding/types';
import { isRecord } from '../../utils/misc';
import type { AdjustedParameters, SavedRecommendation, SavedSetup } from './types';
import { SAVED_SETUP_SCHEMA_VERSION } from './types';

export const MAX_NAME_LENGTH = 80;
export const MAX_NOTES_LENGTH = 2000;

export type AdjustedKey = keyof AdjustedParameters;

export interface AdjustedFieldSpec {
  readonly key: AdjustedKey;
  readonly label: string;
  unitLabel(system: UnitSystem): string;
  toCanonical(value: number, system: UnitSystem): number;
  fromCanonical(value: number, system: UnitSystem): number;
  decimals(system: UnitSystem): number;
}

const identity = (v: number) => v;

export const ADJUSTED_FIELDS: readonly AdjustedFieldSpec[] = [
  { key: 'voltage', label: 'Voltage', unitLabel: () => 'V', toCanonical: identity, fromCanonical: identity, decimals: () => 1 },
  {
    key: 'wireFeedMmPerMin',
    label: 'Wire Feed Speed',
    unitLabel: (s) => (s === 'imperial' ? 'IPM' : 'm/min'),
    toCanonical: (v, s) => wireFeedToMmPerMin(v, DISPLAY_UNITS[s].wireFeed),
    fromCanonical: (v, s) => mmPerMinToWireFeed(v, DISPLAY_UNITS[s].wireFeed),
    decimals: (s) => (s === 'imperial' ? 0 : 1),
  },
  { key: 'amperage', label: 'Amperage', unitLabel: () => 'A', toCanonical: identity, fromCanonical: identity, decimals: () => 0 },
  {
    key: 'gasFlowLpm',
    label: 'Gas Flow',
    unitLabel: (s) => (s === 'imperial' ? 'CFH' : 'L/min'),
    toCanonical: (v, s) => flowToLpm(v, DISPLAY_UNITS[s].flow),
    fromCanonical: (v, s) => lpmToFlow(v, DISPLAY_UNITS[s].flow),
    decimals: (s) => (s === 'imperial' ? 0 : 1),
  },
];

export type AdjustedTexts = Partial<Record<AdjustedKey, string>>;

export type AdjustedParseResult =
  | { readonly ok: true; readonly value: AdjustedParameters }
  | { readonly ok: false; readonly errors: Partial<Record<AdjustedKey, string>> };

/** Converts user-entered display values to canonical units. Blank fields are omitted. */
export function parseAdjustedTexts(texts: AdjustedTexts, system: UnitSystem): AdjustedParseResult {
  const value: { -readonly [K in AdjustedKey]?: number } = {};
  const errors: Partial<Record<AdjustedKey, string>> = {};
  for (const field of ADJUSTED_FIELDS) {
    const text = texts[field.key]?.trim().replace(',', '.') ?? '';
    if (text === '') continue;
    const n = Number(text);
    if (!Number.isFinite(n) || n <= 0) {
      errors[field.key] = `${field.label} must be a number greater than 0.`;
      continue;
    }
    value[field.key] = field.toCanonical(n, system);
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

export function adjustedToTexts(adjusted: AdjustedParameters, system: UnitSystem): AdjustedTexts {
  const texts: AdjustedTexts = {};
  for (const field of ADJUSTED_FIELDS) {
    const v = adjusted[field.key];
    if (v !== undefined) texts[field.key] = formatNumber(field.fromCanonical(v, system), field.decimals(system));
  }
  return texts;
}

function isRange(value: unknown): value is Range {
  return isRecord(value) && typeof value.min === 'number' && typeof value.max === 'number';
}

/** Recommended range for an adjustable field, formatted in display units; null if the record lacks it. */
export function recommendedRangeText(field: AdjustedFieldSpec, values: WeldingRecord | undefined, system: UnitSystem): string | null {
  const raw = values ? (values as unknown as Record<string, unknown>)[field.key] : undefined;
  if (!isRange(raw)) return null;
  return formatRange(
    { min: field.fromCanonical(raw.min, system), max: field.fromCanonical(raw.max, system) },
    field.decimals(system),
    field.unitLabel(system),
  );
}

export function validateSetupName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Enter a name.';
  if (trimmed.length > MAX_NAME_LENGTH) return `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  return null;
}

export function toSavedRecommendation(result: RecommendationResult<WeldingRecord>): SavedRecommendation | null {
  if (result.status !== 'exact' && result.status !== 'interpolated') return null;
  return {
    status: result.status,
    dataQuality: result.dataQuality,
    values: result.values,
    sourceRecordIds: result.sources.map((r) => r.id),
  };
}

export interface NewSetupFields {
  readonly name: string;
  readonly input: SavedSetup['input'];
  readonly recommendation: SavedRecommendation | null;
  readonly adjusted: AdjustedParameters;
  readonly notes: string;
}

export function createSavedSetup(fields: NewSetupFields, id: string, now: Date): SavedSetup {
  const timestamp = now.toISOString();
  return {
    schemaVersion: SAVED_SETUP_SCHEMA_VERSION,
    id,
    name: fields.name.trim(),
    input: fields.input,
    recommendation: fields.recommendation,
    adjusted: fields.adjusted,
    notes: fields.notes.slice(0, MAX_NOTES_LENGTH),
    machineProfileId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export type SetupChanges = Partial<Pick<SavedSetup, 'name' | 'notes' | 'adjusted'>>;

export function updateSavedSetup(setup: SavedSetup, changes: SetupChanges, now: Date): SavedSetup {
  return {
    ...setup,
    ...changes,
    name: (changes.name ?? setup.name).trim(),
    notes: (changes.notes ?? setup.notes).slice(0, MAX_NOTES_LENGTH),
    updatedAt: now.toISOString(),
  };
}

export function duplicateSavedSetup(setup: SavedSetup, id: string, now: Date): SavedSetup {
  const timestamp = now.toISOString();
  const name = `${setup.name} (copy)`.slice(0, MAX_NAME_LENGTH);
  return { ...setup, id, name, createdAt: timestamp, updatedAt: timestamp };
}

function isValidInput(value: unknown): value is SavedSetup['input'] {
  return (
    isRecord(value) &&
    (WELDING_PROCESSES as readonly unknown[]).includes(value.process) &&
    (BASE_MATERIALS as readonly unknown[]).includes(value.material) &&
    (JOINT_TYPES as readonly unknown[]).includes(value.joint) &&
    (WELD_POSITIONS as readonly unknown[]).includes(value.position) &&
    typeof value.thicknessMm === 'number' &&
    isRecord(value.consumable) &&
    Object.values(value.consumable).every((v) => typeof v === 'string')
  );
}

function isValidAdjusted(value: unknown): value is AdjustedParameters {
  return isRecord(value) && Object.values(value).every((v) => typeof v === 'number' && Number.isFinite(v));
}

function isValidSetup(value: unknown): value is SavedSetup {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === SAVED_SETUP_SCHEMA_VERSION &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.notes === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    (value.machineProfileId === null || typeof value.machineProfileId === 'string') &&
    (value.recommendation === null || (isRecord(value.recommendation) && isRecord(value.recommendation.values))) &&
    isValidInput(value.input) &&
    isValidAdjusted(value.adjusted)
  );
}

/** Accepts stored data of unknown shape; drops entries that don't match the current schema. */
export function parseSavedSetups(raw: unknown): SavedSetup[] {
  return Array.isArray(raw) ? raw.filter(isValidSetup) : [];
}
