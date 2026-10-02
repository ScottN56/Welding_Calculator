import { isObject, importEntryRows, type StagingImportRow } from '../../src/features/welding/data/staging/importExport/types';
import type { WeldingProcess } from '../../src/features/welding/types';
import { importOfficialSource } from './dispatch';
import { fetchSource } from './fetchSource';
import { hashSource } from './hashSource';
import { emptyImportState } from './importSource';
import { validateScanCatalog, validateScanSource, type ScanSource } from './sources';
import type { Manufacturer, RetrievedSource, SourceImportState } from './types';

export interface ScanCounters {
  sourcesChecked: number;
  sourcesUnchanged: number;
  sourcesChanged: number;
  sourcesFailed: number;
  rowsDiscovered: number;
  rowsParsed: number;
  rowsStaged: number;
  duplicateRows: number;
  unsupportedRows: number;
  rowsRequiringReview: number;
}

export interface ScanReport {
  readonly scannedAt: string;
  readonly dryRun: boolean;
  readonly changedOnly: boolean;
  readonly summary: ScanCounters;
  readonly byManufacturer: Record<string, ScanCounters>;
  readonly byProcess: Record<string, ScanCounters>;
  readonly byClassification: Record<string, { rows: number; staged: number; duplicates: number; requiringReview: number }>;
  readonly failures: { sourceId: string; url: string; adapter: string; reason: string }[];
  readonly duplicateConflicts: { sourceId: string; recordId: string; reason: string }[];
  readonly outcomes: {
    sourceId: string; status: string; message: string;
    sourceReached?: boolean; url?: string; finalUrl?: string; adapter?: string; sourceType?: string;
    sourceClassification?: string; parsedClassifications?: readonly string[];
    rowsDiscovered?: number; rowsParsed?: number; rowsStaged?: number; unsupportedRows?: number;
    publicDataDetected?: boolean; warnings?: readonly string[];
  }[];
}

export function counters(): ScanCounters {
  return { sourcesChecked: 0, sourcesUnchanged: 0, sourcesChanged: 0, sourcesFailed: 0, rowsDiscovered: 0, rowsParsed: 0, rowsStaged: 0, duplicateRows: 0, unsupportedRows: 0, rowsRequiringReview: 0 };
}

function addCounters(target: ScanCounters, values: ScanCounters): void {
  for (const key of Object.keys(target) as (keyof ScanCounters)[]) target[key] += values[key];
}

function identityEvidence(row: StagingImportRow): string {
  const provenance = isObject(row.raw) && isObject(row.raw.provenance) ? row.raw.provenance : {};
  return JSON.stringify({ entry: row.entry, machine: row.manufacturerMachineSetting, classification: row.sourceClassification,
    manufacturer: provenance.manufacturer, sourceUrl: provenance.sourceUrl, documentTitle: provenance.documentTitle, manualNumber: provenance.manualNumber });
}

export async function scanSources(
  catalog: readonly ScanSource[],
  originalState: SourceImportState,
  options: { manufacturer?: Manufacturer; process?: WeldingProcess; changedOnly?: boolean; dryRun?: boolean } = {},
  environment: { request?: typeof fetch; now?: () => string } = {},
) {
  validateScanCatalog(catalog);
  const selected = catalog.filter((source) => source.enabled &&
    (!options.manufacturer || source.manufacturer === options.manufacturer) &&
    (!options.process || source.process === options.process || source.processes?.includes(options.process)));
  const report: ScanReport = {
    scannedAt: environment.now?.() ?? new Date().toISOString(), dryRun: Boolean(options.dryRun), changedOnly: Boolean(options.changedOnly),
    summary: counters(), byManufacturer: {}, byProcess: {}, byClassification: {}, failures: [], duplicateConflicts: [], outcomes: [],
  };
  let state = originalState;
  const snapshots: { source: RetrievedSource; sha256: string }[] = [];
  const existing = new Map<string, StagingImportRow>();
  for (const row of state.rows) {
    if (existing.has(row.entry.recordId)) report.duplicateConflicts.push({ sourceId: 'existing-staging', recordId: row.entry.recordId, reason: 'Existing queue already contains duplicate IDs; no existing rows were overwritten.' });
    else existing.set(row.entry.recordId, row);
  }

  for (const source of selected) {
    const values = counters();
    values.sourcesChecked = 1;
    let changed = false;
    let sourceReached = false;
    let finalUrl: string | undefined;
    let publicDataDetected: boolean | undefined;
    const warnings = new Set<string>();
    const parsedClassifications = new Set<string>();
    try {
      validateScanSource(source);
      const retrieved = await fetchSource(source.url, environment.request ?? fetch);
      sourceReached = true;
      finalUrl = retrieved.url;
      if (retrieved.mediaType !== source.expectedSourceType) throw new Error(`Expected ${source.expectedSourceType}, received ${retrieved.mediaType}.`);
      const sha256 = hashSource(retrieved.bytes);
      const history = state.sources.filter((previous) => previous.sourceUrl === retrieved.url);
      const last = history[history.length - 1];
      const unchanged = last?.sha256 === sha256;
      changed = last !== undefined && !unchanged;
      if (changed) values.sourcesChanged = 1;
      if (unchanged) values.sourcesUnchanged = 1;
      if (unchanged && options.changedOnly) {
        report.outcomes.push({ sourceId: source.id, status: 'unchanged', message: 'Source hash unchanged; parsing and staging skipped.' });
        continue;
      }

      const result = await importOfficialSource(retrieved, emptyImportState());
      publicDataDetected = result.discovery?.publicDataDetected ?? result.state.rows.length > 0;
      for (const warning of result.discovery?.warnings ?? []) warnings.add(warning);
      if (result.status === 'unsupported') warnings.add(result.message);
      const rows = result.state.rows;
      values.rowsDiscovered = result.discovery?.rowsParsed ?? (result.categories
        ? result.categories.directParameterRows + result.categories.machineSettingRows + result.categories.unsupportedRows + result.categories.parseFailures
        : rows.length);
      values.rowsParsed = values.rowsDiscovered - (result.categories?.parseFailures ?? 0);
      values.duplicateRows = result.categories?.duplicatesSkipped ?? Math.max(0, values.rowsDiscovered - rows.length);
      values.unsupportedRows = result.categories ? result.categories.unsupportedRows + result.categories.parseFailures
        : rows.filter((row) => row.sourceClassification === 'unsupported').length;
      const added: StagingImportRow[] = [];
      const sourceRecords = new Map(existing);
      for (const row of rows) {
        const classification = row.sourceClassification ?? (row.manufacturerMachineSetting ? 'machine-specific-setting' : 'unclassified');
        parsedClassifications.add(classification);
        for (const warning of row.validationErrors) warnings.add(warning);
        const group = report.byClassification[classification] ??= { rows: 0, staged: 0, duplicates: 0, requiringReview: 0 };
        group.rows += 1;
        const previous = sourceRecords.get(row.entry.recordId);
        if (previous) {
          values.duplicateRows += 1;
          group.duplicates += 1;
          if (identityEvidence(previous) !== identityEvidence(row)) report.duplicateConflicts.push({
            sourceId: source.id, recordId: row.entry.recordId, reason: 'Same deterministic record ID has different source evidence or values; existing record retained for manual resolution.',
          });
          continue;
        }
        const revalidated = importEntryRows([{
          entry: row.entry, raw: row.raw, errors: row.importErrors,
          ...(row.manufacturerMachineSetting === undefined ? {} : { manufacturerMachineSetting: row.manufacturerMachineSetting }),
          ...(row.sourceClassification === undefined ? {} : { sourceClassification: row.sourceClassification }),
        }]).rows[0];
        if (!revalidated) throw new Error('Adapter row could not be retained in unverified staging.');
        added.push(revalidated);
        sourceRecords.set(revalidated.entry.recordId, revalidated);
        group.staged += options.dryRun ? 0 : 1;
        group.requiringReview += 1;
      }
      values.rowsStaged = options.dryRun ? 0 : added.length;
      values.rowsRequiringReview = added.length;
      for (const row of added) existing.set(row.entry.recordId, row);
      state = { ...state, rows: [...state.rows, ...added], sources: unchanged ? state.sources : [...state.sources, result.provenance] };
      if (!unchanged) snapshots.push({ source: retrieved, sha256 });
      report.outcomes.push({ sourceId: source.id, status: changed ? 'changed' : unchanged ? 'unchanged' : result.status,
        message: changed ? 'Source changed; human review required.' : result.message });
    } catch (error) {
      values.sourcesFailed = 1;
      const reason = error instanceof Error ? error.message : 'Unknown source failure';
      warnings.add(reason);
      report.failures.push({ sourceId: source.id, url: source.url, adapter: source.adapter, reason });
      report.outcomes.push({ sourceId: source.id, status: 'failed', message: changed ? 'Source changed; human review required.' : 'Source failed; remaining sources will continue.' });
    } finally {
      const outcome = report.outcomes.find((value) => value.sourceId === source.id);
      if (outcome) Object.assign(outcome, {
        sourceReached, url: source.url, ...(finalUrl ? { finalUrl } : {}), adapter: source.adapter,
        sourceType: source.sourceType ?? source.expectedSourceType, sourceClassification: source.sourceClassification ?? 'unclassified',
        parsedClassifications: [...parsedClassifications], rowsDiscovered: values.rowsDiscovered, rowsParsed: values.rowsParsed,
        rowsStaged: values.rowsStaged, unsupportedRows: values.unsupportedRows,
        ...(publicDataDetected === undefined ? {} : { publicDataDetected }), warnings: [...warnings],
      });
      addCounters(report.summary, values);
      addCounters(report.byManufacturer[source.manufacturer] ??= counters(), values);
      const processGroup = source.process ?? (source.processes?.length ? source.processes.join(',') : 'unknown');
      addCounters(report.byProcess[processGroup] ??= counters(), values);
    }
  }
  return { report, state: options.dryRun ? originalState : { ...state, lastScan: report as unknown as Readonly<Record<string, unknown>> }, snapshots: options.dryRun ? [] : snapshots };
}