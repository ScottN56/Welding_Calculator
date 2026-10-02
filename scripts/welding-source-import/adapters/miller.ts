import { emptyGmawEntryForm } from '../../../src/features/welding/data/staging/gmawEntry';
import { importEntryRows, type StagingImportInput } from '../../../src/features/welding/data/staging/importExport/types';
import { hashSource } from '../hashSource';
import { approvedSourceUrl } from '../sourceRegistry';
import { parseMillerSource, type MillerRow } from '../parsers/millerSource';
import type { RetrievedSource, SourceImportProvenance, SourceImportResult, SourceImportState } from '../types';

export const MILLER_PARSER_NAME = 'miller-public-source-data';
export const MILLER_PARSER_VERSION = '1.0.0';
export const MILLER_NO_PUBLIC_DATA = 'Official Miller calculator found, but no supported public data source is available for automated extraction.';

function stagedInput(row: MillerRow, provenance: SourceImportProvenance, batchId?: string): StagingImportInput {
  const entry = emptyGmawEntryForm();
  const rowProvenance = {
    ...provenance, sourceClassification: row.classification,
    ...(row.manualNumber ? { manualNumber: row.manualNumber } : {}),
    ...(row.edition ? { edition: row.edition } : {}),
    ...(row.pageNumber === undefined ? {} : { pageNumber: row.pageNumber }),
    tableTitle: row.tableTitle,
  };
  entry.recordId = `miller-source-${hashSource(new TextEncoder().encode(JSON.stringify({
    sourceUrl: provenance.sourceUrl, title: provenance.documentTitle, manualNumber: row.manualNumber,
    edition: row.edition, pageNumber: row.pageNumber, table: row.tableTitle, classification: row.classification,
    fields: row.fields, original: row.original,
  })))}`;
  entry.sourceDatasetId = `miller-document-${hashSource(new TextEncoder().encode(provenance.sourceUrl))}`;
  entry.publisher = 'Miller';
  entry.document = provenance.documentTitle;
  entry.tableOrChart = row.tableTitle;
  if (row.pageNumber !== undefined) entry.page = String(row.pageNumber);
  const errors = [...row.errors];
  if (row.classification === 'recommended-setting') {
    const process = row.fields.find((field) => field.key === 'process')?.text;
    if (process !== 'GMAW') errors.push(`Published process ${process ?? '(missing)'} remains literal source context; no process alias or GMAW applicability was inferred.`);
    for (const field of row.fields) {
      const direct = { material: 'material', gas: 'gas', polarity: 'polarity', transferMode: 'transferMode' } as const;
      if (field.key in direct) entry[direct[field.key as keyof typeof direct]] = field.text;
      else if (field.key === 'wire' && /^wire class\b/i.test(field.header)) entry.wireClass = field.text;
      else if (field.key === 'joint') entry.joints = [field.text];
      else if (field.key === 'position') entry.positions = [field.text];
      else {
        const match = /^(\d+(?:\.\d*)?|\.\d+)(?:\s*(?:-|\u2013|\u2014|to)\s*(\d+(?:\.\d*)?|\.\d+))?(?:\s+([^\d]+))?$/i.exec(field.text);
        if (!match?.[1]) continue;
        const min = match[1];
        const max = match[2] ?? min;
        const unit = match[3] ?? field.unit;
        if (!unit || (match[3] && field.unit && match[3] !== field.unit)) { errors.push(`Missing/conflicting source unit for ${field.header}; no unit was assumed.`); continue; }
        if (field.key === 'wireDiameter' && min === max) { entry.wireDiameter = min; entry.wireDiameterUnit = unit; }
        else if (field.key === 'thickness') { entry.thicknessMin = min; entry.thicknessMax = max; entry.thicknessUnit = unit; }
        else if (field.key === 'wireFeed') { entry.wireFeedMin = min; entry.wireFeedMax = max; entry.wireFeedUnit = unit; }
        else if (field.key === 'gasFlow') { entry.gasFlowMin = min; entry.gasFlowMax = max; entry.gasFlowUnit = unit; }
        else if (field.key === 'voltage' && unit === 'V') { entry.voltageMin = min; entry.voltageMax = max; }
        else if (field.key === 'amperage' && unit === 'A') { entry.amperageMin = min; entry.amperageMax = max; }
        else errors.push(`Source value/unit for ${field.header} retained as evidence; no generic conversion or reinterpretation performed.`);
      }
    }
  }
  return {
    entry, raw: { origin: 'source-extracted', verified: false, provenance: rowProvenance, publishedRow: row },
    ...(batchId ? { batchId } : {}),
    errors, sourceClassification: row.classification,
    ...(row.manufacturerMachineSetting ? { manufacturerMachineSetting: { ...row.manufacturerMachineSetting, machineOrManual: provenance.documentTitle } } : {}),
  };
}

export async function prepareMillerImport(source: RetrievedSource, state: SourceImportState): Promise<SourceImportResult> {
  const approved = approvedSourceUrl(source.url);
  if (approved.source.manufacturer !== 'Miller' || source.manufacturer !== 'Miller') throw new Error('Miller adapter requires an approved first-party Miller URL.');
  const parsed = await parseMillerSource(source);
  const sha256 = hashSource(source.bytes);
  const provenance: SourceImportProvenance = {
    manufacturer: 'Miller', sourceUrl: approved.url.href, documentTitle: parsed.title,
    retrievedAt: source.retrievedAt, parserName: MILLER_PARSER_NAME, parserVersion: MILLER_PARSER_VERSION, sha256,
    ...(source.sourceId ? { sourceId: source.sourceId } : {}),
    ...(source.sourceType ? { sourceType: source.sourceType } : {}),
    ...(source.localFileName ? { localFileName: source.localFileName } : {}),
    ...(source.importTimestamp ? { importTimestamp: source.importTimestamp } : {}),
    ...(source.batchId ? { batchId: source.batchId } : {}),
  };
  const history = state.sources.filter((previous) => source.sourceId
    ? previous.sourceId === source.sourceId
    : previous.sourceUrl === provenance.sourceUrl);
  const last = history[history.length - 1];
  const discovery = {
    sourceType: source.mediaType === 'pdf' ? 'official Miller PDF' : parsed.calculator ? 'Miller weld-setting calculator' : 'official Miller HTML page',
    publicDataDetected: parsed.publicDataDetected,
    rowsParsed: parsed.rows.length,
    eligibleRows: parsed.rows.filter((row) => row.classification === 'recommended-setting').length,
    tables: [...new Map(parsed.rows.map((row) => [`${row.pageNumber ?? ''}:${row.tableTitle}`, { title: row.tableTitle, classification: row.classification }])).values()],
    warnings: last && last.sha256 !== sha256 ? ['Source changed since previous import; review required.'] : [],
  };
  if (!parsed.rows.length) return {
    status: 'unsupported', message: parsed.calculator ? MILLER_NO_PUBLIC_DATA : 'Official Miller source found, but no supported explicitly labeled welding table was detected.',
    addedRows: 0, validRows: 0, rowsWithErrors: 0, state, provenance, discovery, batchRows: [],
  };
  const imported = importEntryRows(parsed.rows.map((row) => stagedInput(row, provenance, source.batchId)), []);
  if (last?.sha256 === sha256) return {
    status: 'unchanged', message: 'Source unchanged; no duplicate rows added.', addedRows: 0,
    validRows: imported.summary.validRows, rowsWithErrors: imported.summary.rowsWithErrors, state, provenance, discovery, batchRows: imported.rows,
  };
  const seen = new Set(state.rows.map((row) => row.entry.recordId));
  const added = imported.rows.filter((row) => {
    if (seen.has(row.entry.recordId)) return false;
    seen.add(row.entry.recordId);
    return true;
  });
  return {
    status: last ? 'changed' : 'imported', message: last ? source.localFileName ? 'Source snapshot changed; human review required.' : 'Source changed since previous import; review required.' : 'Published Miller rows extracted into unverified draft staging; human review required.',
    addedRows: added.length, validRows: added.filter((row) => !row.validationErrors.length).length,
    rowsWithErrors: added.filter((row) => row.validationErrors.length).length,
    state: { ...state, sources: [...state.sources, provenance], rows: [...state.rows, ...added] },
    provenance, discovery, batchRows: imported.rows,
  };
}