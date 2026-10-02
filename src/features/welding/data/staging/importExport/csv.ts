import Papa from 'papaparse';
import { ENTRY_COLUMNS, importEntryRows, type StagingImportInput, type StagingImportResult, type StagingImportRow } from './types';

const TRANSPORT_COLUMNS = ['_importErrors', '_raw', '_manufacturerMachineSetting', '_sourceClassification', '_batchId', '_datasetClassification'] as const;

/** Joints and positions use semicolons; all units and source values must be entered explicitly. */
export function stagedCsvTemplate(): string {
  return Papa.unparse([[...ENTRY_COLUMNS]], { newline: '\r\n' });
}

export function exportStagedCsv(rows: readonly StagingImportRow[]): string {
  const data = rows.map((row) => [
    ...ENTRY_COLUMNS.map((key) => {
      const value = row.entry[key];
      return Array.isArray(value) ? value.join(';') : value;
    }),
    JSON.stringify(row.importErrors),
    JSON.stringify(row.raw),
    row.manufacturerMachineSetting ? JSON.stringify(row.manufacturerMachineSetting) : '',
    row.sourceClassification ?? '',
    row.batchId ?? '',
    row.datasetClassification ?? '',
  ]);
  if (data.some((row) => row.some((cell) => typeof cell === 'string' && /^(?:\s*[=+\-@]|[\t\r])/.test(cell)))) {
    throw new Error('CSV export blocked: a cell could be interpreted as a spreadsheet formula. Export JSON to preserve it unchanged.');
  }
  return Papa.unparse({ fields: [...ENTRY_COLUMNS, ...TRANSPORT_COLUMNS], data }, { newline: '\r\n', quotes: true });
}

export function importStagedCsv(text: string, existing: readonly StagingImportRow[] = []): StagingImportResult {
  const parsed = Papa.parse<string[]>(text, { delimiter: ',', skipEmptyLines: false, dynamicTyping: false });
  const headers = (parsed.data[0] ?? []).map((header, index) => index === 0 ? header.replace(/^\uFEFF/, '') : header);
  const headerErrors: string[] = [];
  if (headers.every((header) => header === '')) headerErrors.push('CSV headers are missing.');
  if (new Set(headers).size !== headers.length) headerErrors.push('Duplicate CSV headers.');
  for (const header of headers) {
    if (![...ENTRY_COLUMNS, ...TRANSPORT_COLUMNS].some((column) => column === header)) headerErrors.push(`Unknown CSV column: ${header}`);
  }
  const parseErrors = parsed.errors.map((error) => `CSV ${error.code}: ${error.message}`);
  const inputs: StagingImportInput[] = [];
  let skippedRows = 0;
  for (const cells of parsed.data.slice(1)) {
    if (cells.length === 1 && cells[0] === '') {
      skippedRows += 1;
      continue;
    }
    const errors = [...headerErrors, ...parseErrors];
    if (cells.length !== headers.length) errors.push(`CSV row has ${cells.length} cells; expected ${headers.length}. Original cells retained.`);
    const entry: Record<string, string> = {};
    let raw: unknown = { headers, cells };
    let manufacturerMachineSetting: unknown;
    let sourceClassification: string | undefined;
    let batchId: unknown;
    let datasetClassification: string | undefined;
    headers.forEach((header, index) => {
      const value = cells[index];
      if (value === undefined) return;
      if (header === '_raw' && value !== '') {
        try { raw = JSON.parse(value) as unknown; }
        catch { errors.push('Malformed _raw payload; original CSV cells retained.'); }
      } else if (header === '_sourceClassification' && value !== '') {
        sourceClassification = value;
      } else if (header === '_batchId' && value !== '') {
        batchId = value;
      } else if (header === '_datasetClassification' && value !== '') {
        datasetClassification = value;
      } else if (header === '_manufacturerMachineSetting' && value !== '') {
        try { manufacturerMachineSetting = JSON.parse(value) as unknown; }
        catch { errors.push('Malformed manufacturer machine setting; original CSV cells retained.'); }
      } else if (header === '_importErrors' && value !== '') {
        try {
          const previousErrors: unknown = JSON.parse(value);
          if (Array.isArray(previousErrors) && previousErrors.every((error: unknown) => typeof error === 'string')) errors.push(...previousErrors);
          else errors.push('Invalid _importErrors metadata.');
        } catch { errors.push('Malformed _importErrors metadata.'); }
      } else if ((ENTRY_COLUMNS as readonly string[]).includes(header)) entry[header] = value;
    });
    inputs.push({ entry, raw, errors, ...(manufacturerMachineSetting === undefined ? {} : { manufacturerMachineSetting }), ...(sourceClassification === undefined ? {} : { sourceClassification }), ...(batchId === undefined ? {} : { batchId }), ...(datasetClassification === undefined ? {} : { datasetClassification }) });
  }
  if (inputs.length === 0 && (headerErrors.length || parseErrors.length)) {
    inputs.push({ entry: null, raw: text, errors: [...headerErrors, ...parseErrors] });
  }
  const result = importEntryRows(inputs, existing);
  return { ...result, summary: { ...result.summary, skippedRows } };
}