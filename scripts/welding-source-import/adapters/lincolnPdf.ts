import { emptyGmawEntryForm } from '../../../src/features/welding/data/staging/gmawEntry';
import type { DatasetClassification } from '../../../src/features/welding/data/datasetClassification';
import { importEntryRows, type StagingImportInput } from '../../../src/features/welding/data/staging/importExport/types';
import { hashSource } from '../hashSource';
import { approvedSourceUrl } from '../sourceRegistry';
import { extractLincolnPdf, headerColumn, parseLincolnTabularText, type LincolnPublishedRow } from '../parsers/lincolnPdfTables';
import type { RetrievedSource, SourceImportProvenance, SourceImportResult, SourceImportState } from '../types';

export const LINCOLN_PARSER_NAME = 'lincoln-pdf-setting-tables';
export const LINCOLN_PARSER_VERSION = '1.0.0';

function identity(row: LincolnPublishedRow, provenance: SourceImportProvenance): string {
  return hashSource(new TextEncoder().encode(JSON.stringify({
    document: provenance.documentTitle,
    manualNumber: row.context.manualNumber ?? provenance.manualNumber ?? null,
    page: row.pageNumber,
    table: row.tableTitle,
    process: row.context.process ?? null,
    wire: row.context.wire ?? null,
    wireDiameter: row.context.wireDiameter ?? null,
    gas: row.context.gas ?? null,
    thickness: row.context.thickness ?? null,
    polarity: row.context.polarity ?? null,
    setting: row.manufacturerMachineSetting ?? row.physicalValues,
    cells: row.cells,
  })));
}

function rowInput(row: LincolnPublishedRow, provenance: SourceImportProvenance, batchId?: string, datasetClassification?: DatasetClassification): StagingImportInput {
  const entry = emptyGmawEntryForm();
  const sourceIdentity = identity(row, provenance);
  entry.recordId = `lincoln-source-${sourceIdentity}`;
  entry.sourceDatasetId = `lincoln-manual-${hashSource(new TextEncoder().encode(provenance.manualNumber ?? provenance.documentTitle))}`;
  entry.publisher = 'Lincoln Electric';
  entry.document = provenance.documentTitle;
  entry.page = String(row.pageNumber);
  entry.tableOrChart = row.tableTitle;
  const errors = [...row.errors, 'Source-extracted Lincoln row requires human review; unpublished fields and source applicability are not inferred.'];
  if (row.context.process && row.context.process !== 'GMAW') errors.push(`Published process ${row.context.process} is retained as source context, not relabeled GMAW.`);
  if (row.context.gas === 'NONE') errors.push('Published gas NONE is retained literally. No self-shielded/FCAW mapping has been inferred.');
  if (row.context.thickness) errors.push('Published thickness representation is retained verbatim in source context; no unit representation has been selected or converted.');

  if (!row.manufacturerMachineSetting && datasetClassification !== 'machine-specific') {
    if (row.context.polarity && ['DCEP', 'DCEN', 'AC'].includes(row.context.polarity)) entry.polarity = row.context.polarity;
    for (const value of row.physicalValues) {
      const match = /^(\d+(?:\.\d*)?|\.\d+)(?:\s*(?:-|\u2013|\u2014|to)\s*(\d+(?:\.\d*)?|\.\d+))?(?:\s+.+)?$/i.exec(value.text);
      if (!match?.[1]) continue;
      const min = match[1];
      const max = match[2] ?? min;
      if (value.kind === 'voltage' && value.unit === 'V') { entry.voltageMin = min; entry.voltageMax = max; }
      else if (value.kind === 'amperage' && value.unit === 'A') { entry.amperageMin = min; entry.amperageMax = max; }
      else if (value.kind === 'wireFeed') { entry.wireFeedMin = min; entry.wireFeedMax = max; entry.wireFeedUnit = value.unit; }
      else if (value.kind === 'gasFlow') { entry.gasFlowMin = min; entry.gasFlowMax = max; entry.gasFlowUnit = value.unit; }
      else errors.push(`Published ${value.unit} values remain source evidence; no unit-label conversion to generic fields was performed.`);
    }
  }

  return {
    entry,
    raw: { origin: 'source-extracted', verified: false, sourceIdentity, provenance, publishedRow: row },
    ...(batchId ? { batchId } : {}),
    errors,
    ...(row.manufacturerMachineSetting ? { manufacturerMachineSetting: {
      ...row.manufacturerMachineSetting,
      settingLabel: row.headers.find((header) => headerColumn(header)?.kind === 'setting') ?? 'Published machine control',
    } } : {}),
    ...(datasetClassification ? { datasetClassification } : {}),
    ...(row.manufacturerMachineSetting ? { sourceClassification: 'machine-specific-setting' } :
      provenance.sourceClassification ? { sourceClassification: provenance.sourceClassification } : {}),
  };
}

export async function prepareLincolnPdfImport(source: RetrievedSource, state: SourceImportState): Promise<SourceImportResult> {
  const approved = approvedSourceUrl(source.url);
  if (source.manufacturer !== 'Lincoln Electric' || approved.source.manufacturer !== 'Lincoln Electric') throw new Error('Lincoln PDF adapter requires an approved Lincoln Electric source.');
  const parsed = source.mediaType === 'text'
    ? parseLincolnTabularText(source.html)
    : await extractLincolnPdf(source.bytes);
  const sha256 = hashSource(source.bytes);
  const provenance: SourceImportProvenance = {
    manufacturer: 'Lincoln Electric', sourceUrl: approved.url.href, documentTitle: parsed.title,
    retrievedAt: source.retrievedAt, parserName: LINCOLN_PARSER_NAME, parserVersion: LINCOLN_PARSER_VERSION, sha256,
    ...(parsed.manualNumber ? { manualNumber: parsed.manualNumber } : {}),
    ...(source.sourceId ? { sourceId: source.sourceId } : {}),
    ...(source.sourceType ? { sourceType: source.sourceType } : {}),
    ...(source.sourceClassification ? { sourceClassification: source.sourceClassification } : {}),
    ...(source.localFileName ? { localFileName: source.localFileName } : {}),
    ...(source.importTimestamp ? { importTimestamp: source.importTimestamp } : {}),
    ...(source.batchId ? { batchId: source.batchId } : {}),
  };
  const categories = {
    directParameterRows: parsed.rows.filter((row) => row.category === 'direct-parameters').length,
    machineSettingRows: parsed.rows.filter((row) => row.category === 'machine-specific').length,
    unsupportedRows: parsed.rows.filter((row) => row.category === 'unsupported').length,
    parseFailures: parsed.failures.length,
    duplicatesSkipped: 0,
  };
  const history = state.sources.filter((previous) => source.sourceId
    ? previous.sourceId === source.sourceId
    : previous.sourceUrl === provenance.sourceUrl);
  const last = history[history.length - 1];
  const machineSpecificManual = provenance.sourceClassification === 'machine-specific-setting' || parsed.manualNumber?.toUpperCase() === 'IM591';
  const inputs: StagingImportInput[] = parsed.rows.map((row) => rowInput(row, provenance, source.batchId,
    machineSpecificManual ? 'machine-specific' : undefined));
  for (const failure of parsed.failures) {
    const entry = emptyGmawEntryForm();
    entry.recordId = `lincoln-parse-failure-${sha256}-${failure.pageNumber}-${inputs.length}`;
    entry.sourceDatasetId = 'lincoln-unsupported-layout';
    entry.publisher = 'Lincoln Electric';
    entry.document = parsed.title;
    entry.page = String(failure.pageNumber);
    entry.tableOrChart = failure.tableTitle;
    inputs.push({ entry, raw: { verified: false, provenance, failure }, errors: [failure.message], ...(source.batchId ? { batchId: source.batchId } : {}) });
  }
  const validated = importEntryRows(inputs, []);
  if (last?.sha256 === sha256) return {
    status: 'unchanged', message: 'Source unchanged; no duplicate rows added.', addedRows: 0,
    validRows: validated.summary.validRows, rowsWithErrors: validated.summary.rowsWithErrors,
    state, provenance, batchRows: validated.rows, categories: { ...categories, duplicatesSkipped: validated.rows.length },
    ...(source.mediaType === 'pdf' ? { pdfDiagnostics: parsed.diagnostics } : {}),
  };

  const seen = new Set(state.rows.map((row) => row.entry.recordId));
  const added = validated.rows.filter((row) => {
    if (seen.has(row.entry.recordId)) { categories.duplicatesSkipped += 1; return false; }
    seen.add(row.entry.recordId);
    return true;
  });
  return {
    status: last ? 'changed' : 'imported',
    message: last ? source.localFileName ? 'Source snapshot changed; human review required.' : 'Source changed since previous import; review required.' : 'Lincoln source rows extracted into unverified staging; human review required.',
    addedRows: added.length, validRows: added.filter((row) => !row.validationErrors.length).length,
    rowsWithErrors: added.filter((row) => row.validationErrors.length).length,
    state: { ...state, sources: [...state.sources, provenance], rows: [...state.rows, ...added] },
    provenance, batchRows: validated.rows, categories,
    ...(source.mediaType === 'pdf' ? { pdfDiagnostics: parsed.diagnostics } : {}),
  };
}