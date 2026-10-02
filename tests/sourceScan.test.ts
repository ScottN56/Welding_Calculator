import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scanSources } from '../scripts/welding-source-import/scanSources';
import { scanMain } from '../scripts/welding-source-import/scan';
import { OFFICIAL_SCAN_SOURCES, type ScanSource } from '../scripts/welding-source-import/sources';
import { emptyImportState } from '../scripts/welding-source-import/importSource';
import { fictionalMillerHtml } from './fixtures/millerSource';
import { fictionalLincolnPdf } from './fixtures/lincolnPdf';
import { gmawSource } from './welding/fixtures';
import { readScanDashboardSummary } from '../src/features/welding/data/staging/importExport/scanSummary';

afterEach(() => vi.restoreAllMocks());

const catalog: readonly ScanSource[] = [
  { id: 'fictional-esab', manufacturer: 'ESAB', url: 'https://esab.com/fictional', expectedSourceType: 'html', enabled: true, process: 'GMAW', notes: 'Fictional test only', adapter: 'esab' },
  { id: 'fictional-lincoln', manufacturer: 'Lincoln Electric', url: 'https://lincolnelectric.com/fictional.pdf', expectedSourceType: 'pdf', enabled: true, process: 'FCAW', notes: 'Fictional test only', adapter: 'lincoln-pdf' },
  { id: 'fictional-miller', manufacturer: 'Miller', url: 'https://millerwelds.com/fictional', expectedSourceType: 'html', enabled: true, process: 'GMAW', notes: 'Fictional test only', adapter: 'miller' },
];

function esabFixture(): string {
  const source = gmawSource();
  return `<!doctype html><html><title>Fictional ESAB-style Product</title><body><table><caption>Recommended Welding Parameters</caption>
    <tr><th>Wire Diameter (${source.wireDiameter.unit})</th><th>Current (A)</th><th>Voltage (V)</th><th>Wire Feed Speed (${source.wireFeed.unit})</th></tr>
    <tr><td>${source.wireDiameter.value}</td><td>${source.amperage!.min}-${source.amperage!.max}</td><td>${source.voltage.min}-${source.voltage.max}</td><td>${source.wireFeed.min}-${source.wireFeed.max}</td></tr></table></body></html>`;
}

async function requests(failEsab = false, changedMiller = false) {
  const pdf = await fictionalLincolnPdf();
  return vi.fn<typeof fetch>().mockImplementation(async (url) => {
    const host = new URL(String(url)).hostname;
    if (host === 'esab.com') return new Response(failEsab ? 'Unavailable' : esabFixture(), { status: failEsab ? 503 : 200, headers: { 'content-type': 'text/html' } });
    if (host === 'lincolnelectric.com') return new Response(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf' } });
    return new Response(fictionalMillerHtml().replace('Fictional Revision A', changedMiller ? 'Fictional Revision B' : 'Fictional Revision A'), { headers: { 'content-type': 'text/html' } });
  });
}

describe('unified official-source scanner (fictional fixtures only)', () => {
  it('scans all manufacturers, groups summary counts and leaves every row unverified', async () => {
    const result = await scanSources(catalog, emptyImportState(), {}, { request: await requests() });
    expect(result.report.summary).toMatchObject({ sourcesChecked: 3, sourcesFailed: 0, rowsDiscovered: 3, rowsParsed: 3, rowsStaged: 3, rowsRequiringReview: 3 });
    expect(Object.keys(result.report.byManufacturer)).toEqual(['ESAB', 'Lincoln Electric', 'Miller']);
    expect(result.report.byProcess.GMAW?.sourcesChecked).toBe(2);
    expect(result.report.byProcess.FCAW?.sourcesChecked).toBe(1);
    expect(result.report.byClassification['machine-specific-setting']?.rows).toBe(1);
    expect(result.state.rows.every((row) => row.reviewStatus === 'draft' && row.readyForVerification === false)).toBe(true);
    expect(result.state.rows.every((row) => row.staged === null || row.staged.draft.provenance.verified === false)).toBe(true);
    expect(result.report.failures).toEqual([]);
    expect(result.report.outcomes[0]).toMatchObject({ sourceReached: true, adapter: 'esab', rowsDiscovered: 1, rowsParsed: 1, rowsStaged: 1 });
    expect(result.report.outcomes[1]?.warnings?.length).toBeGreaterThan(0);
  });

  it('filters by manufacturer without fetching other sources', async () => {
    const request = await requests();
    const result = await scanSources(catalog, emptyImportState(), { manufacturer: 'Miller' }, { request });
    expect(result.report.summary.sourcesChecked).toBe(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(Object.keys(result.report.byManufacturer)).toEqual(['Miller']);
  });

  it('filters by explicitly known process and skips disabled or unknown-process catalog entries', async () => {
    const request = await requests();
    const result = await scanSources([...catalog, { ...catalog[0]!, id: 'disabled', enabled: false }], emptyImportState(), { process: 'GMAW' }, { request });
    expect(result.report.summary.sourcesChecked).toBe(2);
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.report.byManufacturer['Lincoln Electric']).toBeUndefined();
  });

  it('includes catalog-advertised processes without inferring them from welding values', async () => {
    const source = { ...catalog[2]!, process: undefined, processes: ['GMAW', 'GTAW'] as const };
    const { process, ...multiProcess } = source;
    void process;
    const result = await scanSources([multiProcess], emptyImportState(), { process: 'GTAW', dryRun: true }, { request: await requests() });
    expect(result.report.summary.sourcesChecked).toBe(1);
    expect(result.report.summary.rowsStaged).toBe(0);
  });

  it('skips unchanged hashes before parsing with changed-only and reports changed content', async () => {
    const selected = [catalog[2]!];
    const first = await scanSources(selected, emptyImportState(), {}, { request: await requests() });
    const unchanged = await scanSources(selected, first.state, { changedOnly: true }, { request: await requests() });
    expect(unchanged.report.summary).toMatchObject({ sourcesChecked: 1, sourcesUnchanged: 1, rowsParsed: 0, rowsStaged: 0 });
    expect(unchanged.report.outcomes[0]?.message).toContain('parsing and staging skipped');
    const changed = await scanSources(selected, first.state, { changedOnly: true }, { request: await requests(false, true) });
    expect(changed.report.summary.sourcesChanged).toBe(1);
    expect(changed.report.summary.rowsStaged).toBe(1);
    expect(changed.report.outcomes[0]?.message).toBe('Source changed; human review required.');
    expect(changed.state.rows).toHaveLength(2);
  });

  it('continues after one source fails and reports full failure context', async () => {
    const result = await scanSources(catalog, emptyImportState(), {}, { request: await requests(true) });
    expect(result.report.summary).toMatchObject({ sourcesChecked: 3, sourcesFailed: 1, rowsStaged: 2 });
    expect(result.report.failures[0]).toMatchObject({ sourceId: 'fictional-esab', url: catalog[0]!.url, adapter: 'esab', reason: expect.stringContaining('503') });
    expect(result.report.outcomes[0]).toMatchObject({ sourceReached: false, adapter: 'esab', rowsStaged: 0, warnings: [expect.stringContaining('503')] });
  });

  it('isolates unapproved catalog URLs without fetching them or blocking approved sources', async () => {
    const request = await requests();
    const result = await scanSources([
      { ...catalog[0]!, id: 'unapproved', url: 'https://third-party.example/fixture' }, ...catalog,
    ], emptyImportState(), {}, { request });
    expect(request).toHaveBeenCalledTimes(3);
    expect(result.report.summary).toMatchObject({ sourcesChecked: 4, sourcesFailed: 1, rowsStaged: 3 });
    expect(result.report.failures[0]?.reason).toContain('not approved');
  });

  it('reports exact duplicates and separately reports conflicting staged IDs without overwriting', async () => {
    const selected = [catalog[2]!];
    const first = await scanSources(selected, emptyImportState(), {}, { request: await requests() });
    const repeated = await scanSources(selected, first.state, {}, { request: await requests() });
    expect(repeated.report.summary.duplicateRows).toBe(1);
    expect(repeated.report.summary.rowsStaged).toBe(0);
    const originalRow = first.state.rows[0]!;
    const alteredRow = { ...originalRow, entry: { ...originalRow.entry, publisher: 'Fictional conflicting manufacturer' } };
    const conflictState = { ...first.state, rows: [alteredRow] };
    const conflict = await scanSources(selected, conflictState, {}, { request: await requests() });
    expect(conflict.report.duplicateConflicts[0]?.recordId).toBe(originalRow.entry.recordId);
    expect(conflict.state.rows[0]).toEqual(alteredRow);
  });

  it('dry-run returns the original state and does not save history or snapshots', async () => {
    const state = emptyImportState();
    const result = await scanSources(catalog, state, { dryRun: true }, { request: await requests() });
    expect(result.state).toBe(state);
    expect(result.snapshots).toEqual([]);
    expect(result.report.summary).toMatchObject({ sourcesChecked: 3, rowsStaged: 0, rowsRequiringReview: 3 });
  });

  it('CLI dry-run does not create a staging directory and normal scans persist successful rows plus the report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'weld-scan-test-'));
    const directory = join(root, 'staging');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await scanMain(['--dry-run', '--manufacturer', 'miller'], { catalog, stagingDirectory: directory, request: await requests() });
      await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
      const report = await scanMain([], { catalog, stagingDirectory: directory, request: await requests(true) });
      const saved = JSON.parse(await readFile(join(directory, 'imports.json'), 'utf8'));
      expect(saved.rows).toHaveLength(2);
      expect(saved.lastScan.summary.sourcesFailed).toBe(1);
      expect(saved.lastScan.scannedAt).toBe(report.scannedAt);
      expect(readScanDashboardSummary(JSON.stringify(saved))).toMatchObject({ sourcesScanned: 3, failedSources: 1, newStagedRecords: 2 });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('contains three enabled official sources with the requested IDs and metadata', () => {
    expect(OFFICIAL_SCAN_SOURCES.map((source) => source.id)).toEqual([
      'esab-exaton-309lmo-gmaw', 'lincoln-im591-application-chart', 'miller-weld-setting-calculators',
    ]);
    expect(OFFICIAL_SCAN_SOURCES.every((source) => source.enabled && source.sourceType && source.sourceClassification)).toBe(true);
    expect(OFFICIAL_SCAN_SOURCES[1]?.url).toBe('https://ch-delivery.lincolnelectric.com/api/public/content/26bb630a782f417b85ce6424c1c9a96d?v=8fc8c600');
  });

  it('rejects malformed dashboard summaries instead of showing misleading counts', () => {
    expect(readScanDashboardSummary('{broken')).toBeNull();
    expect(readScanDashboardSummary(JSON.stringify({ lastScan: { scannedAt: 'invalid date', summary: {} } }))).toBeNull();
  });
});