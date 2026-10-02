import Papa from 'papaparse';
import { importStagedJson } from './importExport/json';
import { isObject, STAGING_FILE_FORMAT, STAGING_FILE_VERSION, type StagingImportRow } from './importExport/types';

export type ImportBatchManufacturer = 'Miller' | 'Lincoln Electric' | 'ESAB';

export type ImportBatchRowStatus = 'parsed-successfully' | 'validation-errors' | 'unsupported' | 'duplicate';

export interface ImportBatchRow {
  readonly recordId: string;
  readonly sourceRecordIdentity: string;
  readonly status: ImportBatchRowStatus;
  readonly sourceValues: unknown;
  readonly originalUnits: readonly string[];
  readonly sourcePage?: string;
  readonly sourceTable?: string;
  readonly parserWarnings: readonly string[];
  readonly validationErrors: readonly string[];
  readonly manualReviewRequired: true;
}

export interface ImportBatch {
  readonly batchId: string;
  readonly sourceId: string;
  readonly manufacturer: ImportBatchManufacturer;
  readonly sourceUrl: string;
  readonly documentTitle: string;
  readonly localFileName: string;
  readonly sourceHash: string;
  readonly parserName: string;
  readonly parserVersion: string;
  readonly importTimestamp: string;
  readonly dryRun: boolean;
  readonly rowsDiscovered: number;
  readonly rowsParsed: number;
  readonly rowsAcceptedIntoStaging: number;
  readonly rowsWithValidationErrors: number;
  readonly unsupportedRows: number;
  readonly duplicateRows: number;
  readonly parserWarnings: readonly string[];
  readonly sourceChanged: boolean;
  readonly rows: readonly ImportBatchRow[];
}

export interface CreateImportBatchInput {
  readonly sourceId: string;
  readonly manufacturer: ImportBatchManufacturer;
  readonly sourceUrl: string;
  readonly documentTitle: string;
  readonly localFileName: string;
  readonly sourceHash: string;
  readonly parserName: string;
  readonly parserVersion: string;
  readonly importTimestamp: string;
  readonly dryRun: boolean;
  readonly rowsAcceptedIntoStaging: number;
  readonly parserWarnings?: readonly string[];
  readonly sourceChanged: boolean;
  readonly stagingRows: readonly StagingImportRow[];
  readonly priorRows?: readonly StagingImportRow[];
  readonly rowsParsed?: number;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function publishedRow(row: StagingImportRow): Record<string, unknown> {
  const raw = asObject(row.raw);
  return asObject(raw?.publishedRow) ?? asObject(raw?.failure) ?? raw ?? {};
}

function collectUnits(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (current: unknown) => {
    if (Array.isArray(current)) current.forEach(visit);
    else if (typeof current === 'object' && current !== null) {
      for (const [key, child] of Object.entries(current)) {
        if (key.toLowerCase().includes('unit') && typeof child === 'string' && child.trim()) found.add(child);
        else visit(child);
      }
    }
  };
  visit(value);
  return [...found];
}

function rowIsUnsupported(row: StagingImportRow, raw: Record<string, unknown>): boolean {
  const published = publishedRow(row);
  return Boolean(row.manufacturerMachineSetting) || row.sourceClassification === 'unsupported' ||
    row.sourceClassification === 'machine-specific-setting' || published.category === 'unsupported' ||
    Object.hasOwn(raw, 'failure');
}

export function createImportBatchId(input: Pick<CreateImportBatchInput, 'sourceId' | 'sourceHash' | 'parserName' | 'parserVersion' | 'importTimestamp' | 'localFileName'>): string {
  return [input.sourceId, input.sourceHash, input.importTimestamp, input.localFileName, input.parserName, input.parserVersion]
    .map((part) => encodeURIComponent(part)).join(':');
}

export function createImportBatch(input: CreateImportBatchInput): ImportBatch {
  const batchId = createImportBatchId(input);
  const seen = new Set(input.priorRows?.map((row) => row.entry.recordId) ?? []);
  const rows: ImportBatchRow[] = input.stagingRows.map((row, index) => {
    const raw = asObject(row.raw) ?? {};
    const published = publishedRow(row);
    const repeated = seen.has(row.entry.recordId);
    seen.add(row.entry.recordId);
    const unsupported = rowIsUnsupported(row, raw);
    const status: ImportBatchRowStatus = repeated ? 'duplicate' : unsupported ? 'unsupported'
      : row.validationErrors.length ? 'validation-errors' : 'parsed-successfully';
    const tableTitle = typeof published.tableTitle === 'string' ? published.tableTitle
      : typeof row.entry.tableOrChart === 'string' ? row.entry.tableOrChart : undefined;
    const pageNumber = typeof published.pageNumber === 'number' ? String(published.pageNumber) : row.entry.page || undefined;
    const sourceRowNumber = typeof published.rowNumber === 'number' ? String(published.rowNumber)
      : typeof published.sourceRowNumber === 'number' ? String(published.sourceRowNumber) : String(index + 1);
    const tableIdentity = typeof published.tableIdentifier === 'string' ? published.tableIdentifier : tableTitle ?? '';
    return {
      recordId: row.entry.recordId,
      sourceRecordIdentity: `${pageNumber ?? ''}|${tableIdentity}|${sourceRowNumber}`,
      status,
      sourceValues: raw.publishedRow ?? raw.failure ?? row.raw,
      originalUnits: collectUnits(raw.publishedRow ?? raw.failure ?? row.raw),
      ...(pageNumber ? { sourcePage: pageNumber } : {}),
      ...(tableTitle ? { sourceTable: tableTitle } : {}),
      parserWarnings: row.importErrors,
      validationErrors: row.validationErrors,
      manualReviewRequired: true,
    };
  });
  const duplicates = rows.filter((row) => row.status === 'duplicate').length;
  const unsupported = rows.filter((row) => row.status === 'unsupported').length;
  const warnings = [...new Set([...(input.parserWarnings ?? []), ...rows.flatMap((row) => row.parserWarnings)])];
  return {
    batchId, sourceId: input.sourceId, manufacturer: input.manufacturer, sourceUrl: input.sourceUrl,
    documentTitle: input.documentTitle, localFileName: input.localFileName, sourceHash: input.sourceHash,
    parserName: input.parserName, parserVersion: input.parserVersion, importTimestamp: input.importTimestamp,
    dryRun: input.dryRun, rowsDiscovered: rows.length,
    rowsParsed: input.rowsParsed ?? rows.length,
    rowsAcceptedIntoStaging: input.dryRun ? 0 : input.rowsAcceptedIntoStaging,
    rowsWithValidationErrors: rows.filter((row) => row.validationErrors.length > 0).length,
    unsupportedRows: unsupported, duplicateRows: duplicates, parserWarnings: warnings,
    sourceChanged: input.sourceChanged, rows,
  };
}

export function isImportBatch(value: unknown): value is ImportBatch {
  const batch = asObject(value);
  const manufacturers: readonly string[] = ['Miller', 'Lincoln Electric', 'ESAB'];
  const statuses: readonly string[] = ['parsed-successfully', 'validation-errors', 'unsupported', 'duplicate'];
  return Boolean(batch && typeof batch.batchId === 'string' && typeof batch.sourceId === 'string' &&
    manufacturers.includes(String(batch.manufacturer)) && typeof batch.sourceUrl === 'string' && typeof batch.documentTitle === 'string' &&
    typeof batch.localFileName === 'string' && typeof batch.sourceHash === 'string' && /^[a-f0-9]{64}$/.test(batch.sourceHash) &&
    typeof batch.parserName === 'string' && typeof batch.parserVersion === 'string' && typeof batch.importTimestamp === 'string' && Number.isFinite(Date.parse(batch.importTimestamp)) &&
    typeof batch.dryRun === 'boolean' && Array.isArray(batch.rows) && batch.rows.every((item) => {
      const row = asObject(item);
      return Boolean(row && typeof row.recordId === 'string' && typeof row.sourceRecordIdentity === 'string' &&
        statuses.includes(String(row.status)) && Object.hasOwn(row, 'sourceValues') && Array.isArray(row.originalUnits) &&
        row.originalUnits.every((unit: unknown) => typeof unit === 'string') && Array.isArray(row.parserWarnings) &&
        row.parserWarnings.every((warning: unknown) => typeof warning === 'string') && Array.isArray(row.validationErrors) &&
        row.validationErrors.every((error: unknown) => typeof error === 'string') && row.manualReviewRequired === true);
    }) &&
    ['rowsDiscovered', 'rowsParsed', 'rowsAcceptedIntoStaging', 'rowsWithValidationErrors', 'unsupportedRows', 'duplicateRows']
      .every((key) => Number.isInteger(batch[key]) && Number(batch[key]) >= 0) &&
    Array.isArray(batch.parserWarnings) && typeof batch.sourceChanged === 'boolean');
}

function exactJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(exactJson).join(',')}]`;
  const object = asObject(value);
  if (object) return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${exactJson(object[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export interface ImportBatchComparison {
  readonly added: readonly ImportBatchRow[];
  readonly removed: readonly ImportBatchRow[];
  readonly changed: readonly { readonly before: ImportBatchRow; readonly after: ImportBatchRow }[];
  readonly unchanged: readonly ImportBatchRow[];
}

export function compareImportBatches(previous: ImportBatch, next: ImportBatch): ImportBatchComparison {
  if (previous.sourceId !== next.sourceId) throw new Error('Import batches can only be compared when their source IDs match.');
  const before = new Map(previous.rows.map((row) => [row.sourceRecordIdentity, row]));
  const after = new Map(next.rows.map((row) => [row.sourceRecordIdentity, row]));
  const added: ImportBatchRow[] = [];
  const removed: ImportBatchRow[] = [];
  const changed: { before: ImportBatchRow; after: ImportBatchRow }[] = [];
  const unchanged: ImportBatchRow[] = [];
  for (const [identity, row] of after) {
    const prior = before.get(identity);
    if (!prior) added.push(row);
    else if (exactJson(prior.sourceValues) === exactJson(row.sourceValues)) unchanged.push(row);
    else changed.push({ before: prior, after: row });
  }
  for (const [identity, row] of before) if (!after.has(identity)) removed.push(row);
  return { added, removed, changed, unchanged };
}

export function exportImportBatchJson(batch: ImportBatch): string {
  return JSON.stringify({ format: 'weldcalc-dev-import-batch', version: 1, batch }, null, 2);
}

export function exportImportBatchCsv(batch: ImportBatch): string {
  const fields = ['batchId', 'sourceId', 'manufacturer', 'sourceUrl', 'documentTitle', 'localFileName', 'sourceHash', 'parserName', 'parserVersion', 'importTimestamp', 'recordId', 'sourceRecordIdentity', 'status', 'sourcePage', 'sourceTable', 'sourceValues', 'originalUnits', 'parserWarnings', 'validationErrors'];
  const rows = batch.rows.map((row) => [
    batch.batchId, batch.sourceId, batch.manufacturer, batch.sourceUrl, batch.documentTitle, batch.localFileName,
    batch.sourceHash, batch.parserName, batch.parserVersion, batch.importTimestamp, row.recordId,
    row.sourceRecordIdentity, row.status, row.sourcePage ?? '', row.sourceTable ?? '', JSON.stringify(row.sourceValues),
    JSON.stringify(row.originalUnits), JSON.stringify(row.parserWarnings), JSON.stringify(row.validationErrors),
  ]);
  if (rows.some((row) => row.some((cell) => /^(?:\s*[=+\-@]|[\t\r])/.test(cell)))) {
    throw new Error('Batch CSV export blocked: a source value could be interpreted as a spreadsheet formula. Use JSON to preserve it unchanged.');
  }
  return Papa.unparse({ fields, data: rows }, { newline: '\r\n', quotes: true });
}

export interface ImportBatchDocument {
  readonly batches: readonly ImportBatch[];
  readonly rows: readonly StagingImportRow[];
  readonly original: Record<string, unknown>;
}

export function parseImportBatchDocument(text: string): ImportBatchDocument {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('Staging JSON is malformed.'); }
  if (!isObject(parsed) || parsed.format !== STAGING_FILE_FORMAT || parsed.version !== STAGING_FILE_VERSION || !Array.isArray(parsed.rows)) {
    throw new Error('Select a complete welding-source staging imports.json document.');
  }
  const batches = parsed.batches ?? [];
  if (!Array.isArray(batches) || !batches.every(isImportBatch)) throw new Error('Staging document contains invalid import-batch metadata.');
  return { batches, rows: importStagedJson(text).rows, original: parsed };
}

export function deleteStagedImportBatch(text: string, batchId: string): string {
  const loaded = parseImportBatchDocument(text);
  if (!loaded.batches.some((batch) => batch.batchId === batchId)) throw new Error('Import batch was not found in the staging document.');
  const rows = Array.isArray(loaded.original.rows)
    ? loaded.original.rows.filter((row) => !isObject(row) || row.batchId !== batchId)
    : [];
  return JSON.stringify({
    ...loaded.original,
    batches: loaded.batches.filter((batch) => batch.batchId !== batchId),
    rows,
  }, null, 2);
}