import {
  importEntryRows,
  isObject,
  STAGING_FILE_FORMAT,
  STAGING_FILE_VERSION,
  type StagingImportInput,
  type StagingImportResult,
  type StagingImportRow,
} from './types';

export function exportStagedJson(rows: readonly StagingImportRow[]): string {
  return JSON.stringify({ format: STAGING_FILE_FORMAT, version: STAGING_FILE_VERSION, rows }, null, 2);
}

export function importStagedJson(text: string, existing: readonly StagingImportRow[] = []): StagingImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return importEntryRows([{ entry: null, raw: text, errors: ['Malformed JSON; the entire original input is retained.'] }], existing);
  }
  const rows = isObject(parsed) && parsed.format === STAGING_FILE_FORMAT && parsed.version === STAGING_FILE_VERSION
    ? parsed.rows
    : Array.isArray(parsed) ? parsed : undefined;
  if (!Array.isArray(rows)) {
    return importEntryRows([{ entry: null, raw: parsed, errors: ['Expected a staged GMAW file or an array of entry objects.'] }], existing);
  }
  const inputs: StagingImportInput[] = rows.map((row: unknown) => {
    if (!isObject(row) || !Object.hasOwn(row, 'entry')) return { entry: row, raw: row };
    const errors: string[] = [];
    if (row.importErrors !== undefined) {
      if (Array.isArray(row.importErrors) && row.importErrors.every((error: unknown) => typeof error === 'string')) errors.push(...row.importErrors);
      else errors.push('Invalid imported error metadata; original payload retained.');
    }
    return {
      entry: row.entry, raw: Object.hasOwn(row, 'raw') ? row.raw : row, errors,
      ...(row.batchId === undefined ? {} : { batchId: row.batchId }),
      ...(row.datasetClassification === undefined ? {} : { datasetClassification: row.datasetClassification }),
      ...(row.manufacturerMachineSetting === undefined ? {} : { manufacturerMachineSetting: row.manufacturerMachineSetting }),
      ...(row.sourceClassification === undefined ? {} : { sourceClassification: row.sourceClassification }),
    };
  });
  return importEntryRows(inputs, existing);
}