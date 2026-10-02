import type { GmawRecordSource } from '../../../types';
import { DATASET_CLASSIFICATIONS, type DatasetClassification } from '../../datasetClassification';
import { emptyGmawEntryForm, GMAW_ENTRY_FIELDS, validateGmawEntry, type GmawEntryForm } from '../gmawEntry';
import { SOURCE_CLASSIFICATIONS, type SourceClassification, type ManufacturerMachineSetting, type StagedWeldingRecord } from '../types';

export const STAGING_FILE_FORMAT = 'weldcalc-dev-staged-gmaw';
export const STAGING_FILE_VERSION = 1;
export const ENTRY_COLUMNS = [...GMAW_ENTRY_FIELDS.map(([key]) => key), 'joints', 'positions', 'reviewerNotes'] as const;

export interface StagingImportRow {
  readonly entry: GmawEntryForm;
  readonly batchId?: string;
  readonly datasetClassification?: DatasetClassification;
  readonly raw: unknown;
  readonly importErrors: readonly string[];
  readonly validationErrors: readonly string[];
  readonly reviewStatus: 'draft' | 'needs-review';
  readonly readyForVerification: false;
  readonly staged: StagedWeldingRecord<GmawRecordSource> | null;
  readonly manufacturerMachineSetting?: ManufacturerMachineSetting;
  readonly sourceClassification?: SourceClassification;
}

export interface StagingImportSummary {
  readonly rowsImported: number;
  readonly validRows: number;
  readonly rowsWithErrors: number;
  readonly skippedRows: number;
}

export interface StagingImportResult {
  readonly rows: readonly StagingImportRow[];
  readonly summary: StagingImportSummary;
}

export interface StagingImportInput {
  readonly entry: unknown;
  readonly raw: unknown;
  readonly batchId?: unknown;
  readonly datasetClassification?: unknown;
  readonly errors?: readonly string[];
  readonly manufacturerMachineSetting?: unknown;
  readonly sourceClassification?: unknown;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readEntry(value: unknown): { entry: GmawEntryForm; errors: string[] } {
  const entry = emptyGmawEntryForm();
  const errors: string[] = [];
  if (!isObject(value)) return { entry, errors: ['Row must be an entry object; original input retained.'] };

  for (const [key] of GMAW_ENTRY_FIELDS) {
    const input = value[key];
    if (input === undefined) continue;
    if (typeof input === 'string') entry[key] = input;
    else if (typeof input === 'number' && Number.isFinite(input) && /Min$|Max$|^wireDiameter$/.test(key)) entry[key] = String(input);
    else errors.push(`${key}: expected text${/Min$|Max$|^wireDiameter$/.test(key) ? ' or a finite number' : ''}; raw value retained`);
  }
  for (const key of ['joints', 'positions'] as const) {
    const input = value[key];
    if (input === undefined) continue;
    if (typeof input === 'string') entry[key] = input === '' ? [] : input.split(';').map((item) => item.trim());
    else if (Array.isArray(input) && input.every((item: unknown) => typeof item === 'string')) entry[key] = [...input];
    else errors.push(`${key}: expected a string list or semicolon-separated text; raw value retained`);
  }
  if (value.reviewerNotes !== undefined) {
    if (typeof value.reviewerNotes === 'string') entry.reviewerNotes = value.reviewerNotes;
    else errors.push('reviewerNotes: expected text; raw value retained');
  }
  for (const key of Object.keys(value)) {
    if (!(ENTRY_COLUMNS as readonly string[]).includes(key)) errors.push(`Unexpected entry field ${key}; raw value retained`);
  }
  return { entry, errors };
}

/** Imports are unverified drafts even if their input claims otherwise; no source values are filled. */
export function importEntryRows(
  inputs: readonly StagingImportInput[],
  existing: readonly StagingImportRow[] = [],
): StagingImportResult {
  const counts = new Map<string, number>();
  const entries = inputs.map((input) => ({ input, ...readEntry(input.entry) }));
  for (const { entry } of [...existing, ...entries]) {
    const id = entry.recordId.trim();
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const rows = entries.map(({ input, entry, errors }): StagingImportRow => {
    const importErrors = [...(input.errors ?? []), ...errors];
    const sourceClassification = SOURCE_CLASSIFICATIONS.find((classification) => classification === input.sourceClassification);
    if (input.sourceClassification !== undefined && sourceClassification === undefined) importErrors.push('Invalid source classification; generic promotion is blocked.');
    if (sourceClassification !== undefined && sourceClassification !== 'recommended-setting') importErrors.push(`Source classification ${sourceClassification} is not eligible for generic recommendation promotion.`);
    let manufacturerMachineSetting: ManufacturerMachineSetting | undefined;
    if (input.manufacturerMachineSetting !== undefined) {
      const setting = input.manufacturerMachineSetting;
      if (isObject(setting) && typeof setting.value === 'string' && setting.value.trim() &&
        (setting.machineOrManual === undefined || typeof setting.machineOrManual === 'string') &&
        (setting.manualNumber === undefined || typeof setting.manualNumber === 'string')) {
        manufacturerMachineSetting = {
          value: setting.value,
          ...(typeof setting.machineOrManual === 'string' ? { machineOrManual: setting.machineOrManual } : {}),
          ...(typeof setting.manualNumber === 'string' ? { manualNumber: setting.manualNumber } : {}),
        };
      } else importErrors.push('Malformed manufacturer machine setting; original input retained.');
      importErrors.push('Machine-specific setting cannot become a generic calculator record without an explicit reviewed mapping from the official source.');
    }
    const result = validateGmawEntry(entry);
    const uniqueImportErrors = [...new Set(importErrors)];
    const batchId = typeof input.batchId === 'string' && input.batchId.trim() ? input.batchId : undefined;
    if (input.batchId !== undefined && batchId === undefined) uniqueImportErrors.push('Invalid batch ID metadata; row remains unlinked.');
    const datasetClassification = DATASET_CLASSIFICATIONS.find((classification) => classification === input.datasetClassification);
    if (input.datasetClassification !== undefined && datasetClassification === undefined) uniqueImportErrors.push('Invalid dataset classification; row remains ineligible for promotion.');
    const validationErrors = [...uniqueImportErrors, ...(result.ok ? [] : result.errors)];
    if ((counts.get(entry.recordId.trim()) ?? 0) > 1) validationErrors.push(`Duplicate record ID: ${entry.recordId}; existing rows are not overwritten`);
    return {
      entry,
      ...(batchId ? { batchId } : {}),
      ...(datasetClassification ? { datasetClassification } : {}),
      raw: input.raw,
      importErrors: uniqueImportErrors,
      validationErrors,
      reviewStatus: 'draft',
      readyForVerification: false,
      staged: result.ok && uniqueImportErrors.length === 0 && input.manufacturerMachineSetting === undefined &&
        (input.sourceClassification === undefined || sourceClassification === 'recommended-setting') &&
        (input.datasetClassification === undefined || datasetClassification === 'generic-recommendation')
        ? { ...result.staged, reviewStatus: 'draft', readyForVerification: false, ...(sourceClassification ? { sourceClassification } : {}) }
        : null,
      ...(manufacturerMachineSetting === undefined ? {} : { manufacturerMachineSetting }),
      ...(sourceClassification === undefined ? {} : { sourceClassification }),
    };
  });
  const validRows = rows.filter((row) => row.validationErrors.length === 0).length;
  return {
    rows,
    summary: { rowsImported: rows.length, validRows, rowsWithErrors: rows.length - validRows, skippedRows: 0 },
  };
}

export function refreshStagingRows(rows: readonly StagingImportRow[]): readonly StagingImportRow[] {
  const refreshed = importEntryRows(rows.map((row) => ({
    entry: row.entry, raw: row.raw, errors: row.importErrors, ...(row.batchId ? { batchId: row.batchId } : {}),
    ...(row.datasetClassification ? { datasetClassification: row.datasetClassification } : {}),
    ...(row.manufacturerMachineSetting === undefined ? {} : { manufacturerMachineSetting: row.manufacturerMachineSetting }),
    ...(row.sourceClassification === undefined ? {} : { sourceClassification: row.sourceClassification }),
  })));
  return refreshed.rows.map((row, index) => {
    const reviewStatus = row.validationErrors.length === 0 ? rows[index]?.reviewStatus ?? 'draft' : 'draft';
    return {
      ...row,
      reviewStatus,
      staged: row.staged ? { ...row.staged, reviewStatus } : null,
    };
  });
}