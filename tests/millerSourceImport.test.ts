import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fictionalMillerHtml, fictionalMillerPdf } from './fixtures/millerSource';
import { gmawSource, TEST_PROVENANCE } from './welding/fixtures';
import { prepareMillerImport, MILLER_NO_PUBLIC_DATA } from '../scripts/welding-source-import/adapters/miller';
import { classifyMillerTable, parseMillerSource } from '../scripts/welding-source-import/parsers/millerSource';
import { approvedSourceUrl } from '../scripts/welding-source-import/sourceRegistry';
import { emptyImportState } from '../scripts/welding-source-import/importSource';
import { main } from '../scripts/welding-source-import/index';
import type { RetrievedSource } from '../scripts/welding-source-import/types';
import { exportStagedJson, importStagedJson } from '../src/features/welding/data/staging/importExport/json';
import { exportStagedCsv, importStagedCsv } from '../src/features/welding/data/staging/importExport/csv';
import { promoteStagedRecord } from '../src/features/welding/data/staging/promoteStagedRecord';
import type { SourceClassification } from '../src/features/welding/data/staging/types';

afterEach(() => vi.restoreAllMocks());

function htmlSource(html = fictionalMillerHtml()): RetrievedSource {
  return { manufacturer: 'Miller', url: 'https://millerwelds.com/weld-setting-calculators/fictional', retrievedAt: '2026-10-02T00:00:00.000Z', html, bytes: new TextEncoder().encode(html), mediaType: 'html' };
}

describe('Miller importer (fictional local sources only)', () => {
  it.each(['millerwelds.com', 'www.millerwelds.com', 'prod.millerwelds.com'])('allows exact approved host %s', (host) => {
    expect(approvedSourceUrl(`https://${host}/fixture`).source.manufacturer).toBe('Miller');
  });

  it('rejects lookalike URLs and non-Miller sources at the Miller adapter boundary', async () => {
    expect(() => approvedSourceUrl('https://prod.millerwelds.com.evil.example/fixture')).toThrow();
    await expect(prepareMillerImport({ ...htmlSource(), url: 'https://esab.com/fixture' }, emptyImportState())).rejects.toThrow(/first-party Miller/);
  });

  it.each(['MIG', 'FCAW', 'GTAW', 'SMAW'])('retains public structured %s data without mapping process terminology', async (process) => {
    const result = await prepareMillerImport(htmlSource(fictionalMillerHtml('Recommended Welding Settings', process)), emptyImportState());
    expect(result.discovery?.publicDataDetected).toBe(true);
    expect(result.discovery?.eligibleRows).toBe(1);
    const row = result.state.rows[0]!;
    expect(row.sourceClassification).toBe('recommended-setting');
    expect(row.reviewStatus).toBe('draft');
    expect(row.readyForVerification).toBe(false);
    expect(row.staged).toBeNull();
    expect(row.raw).toMatchObject({ verified: false, publishedRow: { fields: expect.arrayContaining([expect.objectContaining({ key: 'process', text: process })]) } });
  });

  it('returns the required no-data message without guessing a calculator response', async () => {
    const source = htmlSource('<!doctype html><html><head><title>Official-looking fictional Weld-Setting Calculator</title></head><body><script>privateCalculator()</script></body></html>');
    const result = await prepareMillerImport(source, emptyImportState());
    expect(result.status).toBe('unsupported');
    expect(result.message).toBe(MILLER_NO_PUBLIC_DATA);
    expect(result.addedRows).toBe(0);
    expect(result.discovery?.publicDataDetected).toBe(false);
  });

  it('supports explicitly labeled public HTML tables without script execution', async () => {
    const source = htmlSource('<!doctype html><html><head><title>Fictional source</title></head><body><table><caption>Recommended Welding Settings</caption><tr><th>Process</th><th>Wire Size (mm)</th></tr><tr><td>MIG</td><td>' + gmawSource().wireDiameter.value + '</td></tr></table></body></html>');
    const parsed = await parseMillerSource(source);
    expect(parsed.rows[0]?.classification).toBe('recommended-setting');
    expect(parsed.rows[0]?.fields.find((field) => field.key === 'wireDiameter')?.unit).toBe('mm');
  });

  it('preserves numeric ranges, unit spelling and leaves unpublished settings missing', async () => {
    const result = await prepareMillerImport(htmlSource(fictionalMillerHtml('Recommended Welding Settings', 'GMAW')), emptyImportState());
    const row = result.state.rows[0]!;
    expect(row.entry.wireFeedMin).toBe(String(gmawSource().wireFeed.min));
    expect(row.entry.wireFeedUnit).toBe('m/min');
    for (const key of ['thicknessMin', 'material', 'amperageMin', 'gasFlowMin'] as const) expect(row.entry[key]).toBe('');
    expect(row.entry.joints).toEqual([]);
    expect(row.entry.positions).toEqual([]);
    expect(row.raw).toMatchObject({ provenance: { manufacturer: 'Miller', manualNumber: 'OM-FICTIONAL', edition: 'Fictional Revision A', sourceClassification: 'recommended-setting' } });
  });

  it('classifies PDF process parameters as machine capability, not a recommendation', async () => {
    const bytes = await fictionalMillerPdf();
    const result = await prepareMillerImport({ ...htmlSource(), url: 'https://prod.millerwelds.com/fictional.pdf', mediaType: 'pdf', html: '', bytes }, emptyImportState());
    const row = result.state.rows[0]!;
    expect(result.discovery?.sourceType).toBe('official Miller PDF');
    expect(result.discovery?.eligibleRows).toBe(0);
    expect(row.sourceClassification).toBe('machine-capability');
    expect(row.entry.wireFeedMin).toBe('');
    expect(row.entry.voltageMin).toBe('');
    expect(row.raw).toMatchObject({ provenance: { pageNumber: 1, tableTitle: 'FCAW And MIG Process Parameters', manualNumber: 'OM-FICTIONAL', edition: 'Fictional Revision A', sourceClassification: 'machine-capability' } });
    for (const imported of [importStagedJson(exportStagedJson(result.state.rows)), importStagedCsv(exportStagedCsv(result.state.rows))]) {
      expect(imported.rows[0]?.sourceClassification).toBe('machine-capability');
      expect(imported.rows[0]?.staged).toBeNull();
    }
  });

  it.each([
    ['Recommended Welding Parameters', 'recommended-setting'],
    ['Machine Control Settings', 'machine-specific-setting'],
    ['Reference Guidance', 'reference-guidance'],
    ['Unlabeled values', 'unsupported'],
  ] as const)('classifies %s conservatively', (title, classification) => {
    expect(classifyMillerTable(title)).toBe(classification);
  });

  it('does not duplicate unchanged data and reports changed source hashes', async () => {
    const first = await prepareMillerImport(htmlSource(), emptyImportState());
    const duplicate = await prepareMillerImport(htmlSource(), first.state);
    expect(duplicate.status).toBe('unchanged');
    expect(duplicate.addedRows).toBe(0);
    const changed = await prepareMillerImport(htmlSource(fictionalMillerHtml().replace('Fictional Revision A', 'Fictional Revision B')), first.state);
    expect(changed.message).toBe('Source changed since previous import; review required.');
    expect(changed.provenance.sha256).not.toBe(first.provenance.sha256);
    expect(first.state.rows[0]?.reviewStatus).toBe('draft');
  });

  it('rejects malformed source instead of inventing data', async () => {
    await expect(prepareMillerImport(htmlSource('<html><table id="'), emptyImportState())).rejects.toThrow(/Malformed Miller/);
    await expect(prepareMillerImport(htmlSource('<!doctype html><html><title>Fixture</title><script type="application/json">{bad</script></html>'), emptyImportState())).rejects.toThrow(/Malformed public JSON/);
  });

  it.each(['machine-capability', 'machine-specific-setting', 'reference-guidance', 'unsupported'] as const)('blocks generic promotion of %s even with valid fields and ready status', (sourceClassification: SourceClassification) => {
    const { provenance, ...draft } = gmawSource();
    const result = promoteStagedRecord({
      draft: { ...draft, provenance: { ...provenance, verified: false } }, sourceDatasetId: 'fixture-dataset',
      reviewStatus: 'ready', reviewerNotes: 'Fictional test only', validationErrors: [], readyForVerification: true, sourceClassification,
    }, { id: 'fixture-dataset', process: 'GMAW', source: TEST_PROVENANCE.source, verifiedBy: 'Fictional Reviewer', verifiedDate: '2026-10-02' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(' ')).toContain('not eligible');
  });

  it('supports read-only CLI dry runs without probing additional endpoints', async () => {
    const root = await mkdtemp(join(tmpdir(), 'miller-import-test-'));
    const directory = join(root, 'staging');
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(fictionalMillerHtml(), { headers: { 'content-type': 'text/html' } }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await main(['--dry-run', '--url', htmlSource().url], { stagingDirectory: directory, request });
      expect(request).toHaveBeenCalledTimes(1);
      expect(log.mock.calls.flat().join(' ')).toContain('Public machine-readable dataset detected: yes');
      await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('reports an unreadable public calculator without treating it as a guessed-data error or writing records', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'miller-no-data-'));
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('<!doctype html><html><title>Fictional Weld-Setting Calculator</title><body>No readable table</body></html>', { headers: { 'content-type': 'text/html' } }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await expect(main(['--url', htmlSource().url], { stagingDirectory: directory, request })).resolves.toBeUndefined();
      expect(log.mock.calls.flat()).toContain(MILLER_NO_PUBLIC_DATA);
      expect(request).toHaveBeenCalledTimes(1);
      await expect(stat(join(directory, 'imports.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});