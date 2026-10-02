import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fictionalLincolnPdf } from './fixtures/lincolnPdf';
import { main } from '../scripts/welding-source-import/importFile';
import { extractLincolnPdf } from '../scripts/welding-source-import/parsers/lincolnPdfTables';
import { hashSource } from '../scripts/welding-source-import/hashSource';
import { importStagedJson } from '../src/features/welding/data/staging/importExport/json';

afterEach(() => vi.restoreAllMocks());

const ESAB_SOURCE = 'esab-exaton-309lmo-gmaw';
const LINCOLN_SOURCE = 'lincoln-im591-application-chart';
const MILLER_SOURCE = 'miller-weld-setting-calculators';

const ESAB_HTML = `<!doctype html><html><head><title>Fictional ESAB Test Page</title></head><body>
<h2>Recommended Welding Parameters</h2><table><tr><th>Wire Diameter (mm)</th><th>Current (A)</th><th>Voltage (V)</th><th>Wire Feed Speed (mm/min)</th></tr>
<tr><td>0.9</td><td>80-100</td><td>18-20</td><td>100-150</td></tr></table></body></html>`;

async function temporaryDirectory(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

describe('catalog-bound local source imports (fictional fixtures only)', () => {
  it('requires a source ID and rejects unknown IDs and unsupported extensions', async () => {
    await expect(main(['--file', 'input.html'])).rejects.toThrow('--source <source-id>');
    await expect(main(['--source', 'not-in-catalog', '--file', 'input.html'])).rejects.toThrow('Unknown source ID');
    await expect(main(['--source', ESAB_SOURCE, '--file', 'input.exe'])).rejects.toThrow('Unsupported local file extension');
  });

  it('imports local ESAB HTML through the recommended-parameters parser and retains unverified provenance', async () => {
    const root = await temporaryDirectory('local-esab-');
    const file = join(root, 'esab-page.html');
    const staging = join(root, 'staging');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await writeFile(file, ESAB_HTML, 'utf8');
      await main(['--source', ESAB_SOURCE, '--file', file], { stagingDirectory: staging, now: () => new Date('2026-10-02T12:00:00.000Z') });
      const json = await readFile(join(staging, 'imports.json'), 'utf8');
      const imported = importStagedJson(json).rows[0]!;
      const stagingDocument = JSON.parse(json) as { batches: { batchId: string; sourceHash: string; rowsAcceptedIntoStaging: number }[] };
      expect(stagingDocument.batches[0]).toMatchObject({ sourceHash: hashSource(new TextEncoder().encode(ESAB_HTML)), rowsAcceptedIntoStaging: 1 });
      expect(imported.batchId).toBe(stagingDocument.batches[0]?.batchId);
      expect(imported.raw).toMatchObject({ verified: false, provenance: {
        sourceId: ESAB_SOURCE, sourceType: 'manufacturer-product-page', manufacturer: 'ESAB',
        sourceUrl: expect.stringContaining('esab.com/us/'), documentTitle: 'Fictional ESAB Test Page',
        localFileName: 'esab-page.html', importTimestamp: '2026-10-02T12:00:00.000Z',
        sha256: hashSource(new TextEncoder().encode(ESAB_HTML)),
      } });
      expect(imported.reviewStatus).toBe('draft');
      expect(imported.readyForVerification).toBe(false);
      expect(imported.staged).toBeNull();
      expect(json).not.toContain(root);
      expect(await readFile(join(staging, 'sources', `${hashSource(new TextEncoder().encode(ESAB_HTML))}.html`), 'utf8')).toBe(ESAB_HTML);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('imports a local Lincoln PDF, reports page diagnostics and preserves machine controls literally', async () => {
    const root = await temporaryDirectory('local-lincoln-pdf-');
    const file = join(root, 'im591.pdf');
    const staging = join(root, 'staging');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const bytes = await fictionalLincolnPdf();
      await writeFile(file, bytes);
      await main(['--source', LINCOLN_SOURCE, '--file', file], { stagingDirectory: staging });
      const rows = importStagedJson(await readFile(join(staging, 'imports.json'), 'utf8')).rows;
      expect(rows[0]).toMatchObject({ manufacturerMachineSetting: { value: 'B-3' }, reviewStatus: 'draft', readyForVerification: false, staged: null });
      expect(rows[0]?.entry.voltageMin).toBe('');
      expect(rows[0]?.entry.amperageMin).toBe('');
      expect(rows[0]?.entry.wireFeedMin).toBe('');
      expect(rows[0]?.raw).toMatchObject({ verified: false, provenance: { sourceId: LINCOLN_SOURCE, localFileName: 'im591.pdf', sourceType: 'pdf-table' } });
      expect(log.mock.calls.flat().join(' ')).toContain('structured extraction succeeded; structured');
      expect(log.mock.calls.flat().join(' ')).toContain('APPLICATION CHART');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.each(['rotated', 'page-rotated'] as const)('normalizes %s Lincoln PDF text into rows without losing machine settings', async (mode) => {
    const parsed = await extractLincolnPdf(await fictionalLincolnPdf(mode));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ category: 'machine-specific', manufacturerMachineSetting: { value: 'B-3' } });
    expect(parsed.diagnostics[0]).toMatchObject({ textItemCount: expect.any(Number), detectedTableHeadings: ['APPLICATION CHART'], structuredExtractionSucceeded: true, status: 'structured' });
    if (mode === 'page-rotated') expect(parsed.diagnostics[0]?.pageRotation).toBe(90);
  });

  it('marks a sparse PDF page manual-review-required and retains its parse-failure row', async () => {
    const parsed = await extractLincolnPdf(await fictionalLincolnPdf('sparse'));
    expect(parsed.diagnostics[0]).toMatchObject({ textItemCount: 1, detectedTableHeadings: ['APPLICATION CHART'], structuredExtractionSucceeded: false, manualReviewRequired: true, status: 'manual-review-required' });
    expect(parsed.failures[0]?.message).toContain('manual review required');
  });

  it('accepts explicit Miller JSON tables and Lincoln tab-delimited text only through their catalog adapters', async () => {
    const root = await temporaryDirectory('local-structured-text-');
    const jsonFile = join(root, 'miller.json');
    const textFile = join(root, 'lincoln.txt');
    const jsonStaging = join(root, 'miller-staging');
    const textStaging = join(root, 'lincoln-staging');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await writeFile(jsonFile, JSON.stringify({
        title: 'Fictional Miller JSON', tables: [{ title: 'Recommended Welding Settings', headers: ['Process', 'Voltage (V)'], rows: [['GMAW', '18 V']] }],
      }));
      await main(['--source', MILLER_SOURCE, '--file', jsonFile], { stagingDirectory: jsonStaging });
      const millerRow = importStagedJson(await readFile(join(jsonStaging, 'imports.json'), 'utf8')).rows[0]!;
      expect(millerRow.raw).toMatchObject({ verified: false, provenance: { sourceId: MILLER_SOURCE, localFileName: 'miller.json' } });

      await writeFile(textFile, [
        'Document title: Fictional Lincoln Text Chart', 'Manual Number: IM-TEXT-FIXTURE', 'APPLICATION CHART',
        'Process\tSetting', 'GMAW\tA-2',
      ].join('\n'));
      await main(['--source', LINCOLN_SOURCE, '--file', textFile], { stagingDirectory: textStaging });
      const lincolnRow = importStagedJson(await readFile(join(textStaging, 'imports.json'), 'utf8')).rows[0]!;
      expect(lincolnRow.manufacturerMachineSetting?.value).toBe('A-2');
      expect(lincolnRow.entry.voltageMin).toBe('');
      expect(lincolnRow.raw).toMatchObject({ verified: false, provenance: { documentTitle: 'Fictional Lincoln Text Chart', manualNumber: 'IM-TEXT-FIXTURE' } });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('reports changed local snapshots and retains earlier unverified rows without overwrite', async () => {
    const root = await temporaryDirectory('local-source-change-');
    const file = join(root, 'source.html');
    const staging = join(root, 'staging');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await writeFile(file, ESAB_HTML, 'utf8');
      await main(['--source', ESAB_SOURCE, '--file', file], { stagingDirectory: staging });
      const firstState = await readFile(join(staging, 'imports.json'), 'utf8');
      await writeFile(file, ESAB_HTML.replace('18-20', '19-21'), 'utf8');
      await main(['--source', ESAB_SOURCE, '--file', file], { stagingDirectory: staging });
      expect(log.mock.calls.flat().join(' ')).toContain('Source snapshot changed; human review required.');
      const changedRows = importStagedJson(await readFile(join(staging, 'imports.json'), 'utf8')).rows;
      const changedDocument = JSON.parse(await readFile(join(staging, 'imports.json'), 'utf8')) as { batches: { sourceChanged: boolean; parserWarnings: string[] }[] };
      expect(changedRows).toHaveLength(2);
      expect(changedDocument.batches[1]).toMatchObject({ sourceChanged: true });
      expect(changedDocument.batches[1]?.parserWarnings).toContain('Source snapshot changed — compare against previously reviewed data before promotion.');
      expect(changedRows.every((row) => row.reviewStatus === 'draft' && !row.readyForVerification)).toBe(true);
      expect(importStagedJson(firstState).rows).toHaveLength(1);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('accounts for duplicate snapshots and unsupported extracted layouts in separate batches', async () => {
    const root = await temporaryDirectory('local-batch-accounting-');
    const file = join(root, 'im591.pdf');
    const staging = join(root, 'staging');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await writeFile(file, await fictionalLincolnPdf('unsupported'));
      await main(['--source', LINCOLN_SOURCE, '--file', file], { stagingDirectory: staging, now: () => new Date('2026-10-02T13:00:00.000Z') });
      const first = JSON.parse(await readFile(join(staging, 'imports.json'), 'utf8')) as { batches: { unsupportedRows: number; rows: { status: string }[] }[] };
      expect(first.batches[0]).toMatchObject({ unsupportedRows: 1, rows: [{ status: 'unsupported' }] });

      await writeFile(file, await fictionalLincolnPdf());
      await main(['--source', LINCOLN_SOURCE, '--file', file], { stagingDirectory: staging, now: () => new Date('2026-10-02T13:01:00.000Z') });
      await main(['--source', LINCOLN_SOURCE, '--file', file], { stagingDirectory: staging, now: () => new Date('2026-10-02T13:02:00.000Z') });
      const repeated = JSON.parse(await readFile(join(staging, 'imports.json'), 'utf8')) as { batches: { duplicateRows: number; rows: { status: string }[] }[] };
      expect(repeated.batches.at(-1)).toMatchObject({ duplicateRows: 1, rows: [{ status: 'duplicate' }] });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('dry-run hashes and parses a local PDF without creating staging files', async () => {
    const root = await temporaryDirectory('local-source-dry-');
    const file = join(root, 'im591.pdf');
    const staging = join(root, 'staging');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await writeFile(file, await fictionalLincolnPdf());
      await main(['--dry-run', '--source', LINCOLN_SOURCE, '--file', file], { stagingDirectory: staging });
      expect(log.mock.calls.flat().join(' ')).toContain('SHA-256:');
      await expect(stat(staging)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});