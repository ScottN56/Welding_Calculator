import { esabRowsToStaging } from './adapters/esabStaging';
import { hashSource } from './hashSource';
import { parseEsabParameters } from './parsers/esabParameters';
import { approvedSourceUrl } from './sourceRegistry';
import type { RetrievedSource, SourceImportProvenance, SourceImportResult, SourceImportState } from './types';
import { STAGING_FILE_FORMAT, STAGING_FILE_VERSION } from '../../src/features/welding/data/staging/importExport/types';

export function emptyImportState(): SourceImportState {
  return { format: STAGING_FILE_FORMAT, version: STAGING_FILE_VERSION, sources: [], rows: [] };
}

export function prepareSourceImport(source: RetrievedSource, state: SourceImportState): SourceImportResult {
  const approved = approvedSourceUrl(source.url);
  if (approved.source.manufacturer !== source.manufacturer || source.manufacturer !== 'ESAB') {
    throw new Error('A reviewed parameter-table parser is currently available only for ESAB HTML pages.');
  }
  const sourceHash = hashSource(source.bytes);
  const history = state.sources.filter((previous) => source.sourceId
    ? previous.sourceId === source.sourceId
    : previous.sourceUrl === approved.url.href);
  const last = history[history.length - 1];
  const parsed = parseEsabParameters(source.html);
  const provenance: SourceImportProvenance = {
    manufacturer: source.manufacturer,
    sourceUrl: approved.url.href,
    documentTitle: parsed.title,
    retrievedAt: source.retrievedAt,
    parserName: parsed.parserName,
    parserVersion: parsed.parserVersion,
    sha256: sourceHash,
    ...(source.sourceId ? { sourceId: source.sourceId } : {}),
    ...(source.sourceType ? { sourceType: source.sourceType } : {}),
    ...(source.localFileName ? { localFileName: source.localFileName } : {}),
    ...(source.importTimestamp ? { importTimestamp: source.importTimestamp } : {}),
    ...(source.batchId ? { batchId: source.batchId } : {}),
  };
  if (last?.sha256 === sourceHash) {
    const validated = esabRowsToStaging(parsed, provenance, [], source.batchId);
    return {
      status: 'unchanged', message: 'Source unchanged; no duplicate rows added.', addedRows: 0,
      validRows: validated.summary.validRows, rowsWithErrors: validated.summary.rowsWithErrors,
      state, provenance, batchRows: validated.rows,
    };
  }
  const imported = esabRowsToStaging(parsed, provenance, state.rows, source.batchId);
  const existingIds = new Set(state.rows.map((row) => row.entry.recordId));
  const added = imported.rows.filter((row) => !existingIds.has(row.entry.recordId));
  const priorHashes = new Set(history.map((previous) => previous.sha256));
  const status = history.length ? 'changed' : 'imported';
  const nextState = {
    ...state,
    sources: [...state.sources, provenance],
    rows: [...state.rows, ...added],
  };
  const validRows = added.filter((row) => row.validationErrors.length === 0).length;
  return {
    status,
    message: status === 'changed'
      ? source.localFileName ? 'Source snapshot changed; human review required.' : `Source changed since previous import; review required.${priorHashes.has(sourceHash) ? ' Previously seen content; existing rows retained without duplication.' : ''}`
      : 'Published source rows extracted into unverified draft staging; human review required.',
    addedRows: added.length,
    validRows,
    rowsWithErrors: added.length - validRows,
    state: nextState,
    provenance,
    batchRows: imported.rows,
  };
}