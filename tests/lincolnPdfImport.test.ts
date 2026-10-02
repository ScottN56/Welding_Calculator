import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fictionalLincolnPdf } from './fixtures/lincolnPdf';
import { gmawSource } from './welding/fixtures';
import { extractLincolnPdf } from '../scripts/welding-source-import/parsers/lincolnPdfTables';
import { prepareLincolnPdfImport } from '../scripts/welding-source-import/adapters/lincolnPdf';
import { emptyImportState } from '../scripts/welding-source-import/importSource';
import { approvedSourceUrl } from '../scripts/welding-source-import/sourceRegistry';
import { fetchSource } from '../scripts/welding-source-import/fetchSource';
import { hashSource } from '../scripts/welding-source-import/hashSource';
import { main } from '../scripts/welding-source-import/index';
import { exportStagedJson, importStagedJson } from '../src/features/welding/data/staging/importExport/json';
import { exportStagedCsv, importStagedCsv } from '../src/features/welding/data/staging/importExport/csv';
import type { RetrievedSource } from '../scripts/welding-source-import/types';

afterEach(() => vi.restoreAllMocks());

function source(bytes: Uint8Array): RetrievedSource {
  return {
    url: 'https://ch-delivery.lincolnelectric.com/fictional-manual.pdf', manufacturer: 'Lincoln Electric',
    retrievedAt: '2026-10-02T00:00:00.000Z', bytes, html: '', mediaType: 'pdf',
  };
}

describe('Lincoln PDF/manual importer (local fictional fixtures only)', () => {
  it.each(['lincolnelectric.com', 'www.lincolnelectric.com', 'ch-delivery.lincolnelectric.com'])('accepts official host %s', (host) => {
    expect(approvedSourceUrl(`https://${host}/fictional.pdf`).source.manufacturer).toBe('Lincoln Electric');
  });

  it('rejects lookalike and unapproved delivery hosts', () => {
    expect(() => approvedSourceUrl('https://ch-delivery.lincolnelectric.com.evil.example/file.pdf')).toThrow();
    expect(() => approvedSourceUrl('https://other.lincolnelectric.com/file.pdf')).toThrow();
  });

  it('recognizes table, process, wire, diameter, gas and exact dual-unit thickness', async () => {
    const parsed = await extractLincolnPdf(await fictionalLincolnPdf());
    expect(parsed.title).toBe('Fictional Lincoln-style Machine Manual');
    expect(parsed.manualNumber).toBe('IM-FICTIONAL');
    expect(parsed.rows[0]).toMatchObject({
      pageNumber: 1, tableTitle: 'APPLICATION CHART', category: 'machine-specific',
      context: { process: 'GMAW', wire: gmawSource().wireClass, wireDiameter: `${gmawSource().wireDiameter.value} ${gmawSource().wireDiameter.unit}`, gas: 'NONE', thickness: '.060 in / 1.6 mm' },
      manufacturerMachineSetting: { value: 'B-3', machineOrManual: 'Fictional Test Machine', manualNumber: 'IM-FICTIONAL' },
      physicalValues: [],
    });
  });

  it('never maps B-3 or NONE into generic calculator settings', async () => {
    const bytes = await fictionalLincolnPdf();
    const result = await prepareLincolnPdfImport(source(bytes), emptyImportState());
    const row = result.state.rows[0]!;
    expect(row.manufacturerMachineSetting?.value).toBe('B-3');
    for (const key of ['voltageMin', 'amperageMin', 'wireFeedMin', 'gas', 'thicknessMin'] as const) expect(row.entry[key]).toBe('');
    expect(row.staged).toBeNull();
    expect(row.reviewStatus).toBe('draft');
    expect(row.readyForVerification).toBe(false);
    expect(row.raw).toMatchObject({ verified: false, provenance: { manufacturer: 'Lincoln Electric', sha256: hashSource(bytes), manualNumber: 'IM-FICTIONAL', parserName: 'lincoln-pdf-setting-tables' } });
    expect(result.categories?.machineSettingRows).toBe(1);
    for (const imported of [importStagedJson(exportStagedJson(result.state.rows)), importStagedCsv(exportStagedCsv(result.state.rows))]) {
      expect(imported.rows[0]?.manufacturerMachineSetting?.value).toBe('B-3');
      expect(imported.rows[0]?.staged).toBeNull();
    }
  });

  it('captures direct physical values with exactly the published units', async () => {
    const bytes = await fictionalLincolnPdf('direct');
    const parsed = await extractLincolnPdf(bytes);
    expect(parsed.rows[0]?.category).toBe('direct-parameters');
    expect(parsed.rows[0]?.physicalValues.map((value) => value.unit)).toEqual(['V', 'A', 'in/min', 'L/min']);
    const result = await prepareLincolnPdfImport(source(bytes), emptyImportState());
    expect(result.categories?.directParameterRows).toBe(1);
    expect(result.state.rows[0]?.entry.voltageMin).toBe(String(gmawSource().voltage.min));
    expect(result.state.rows[0]?.entry.wireFeedUnit).toBe('in/min');
    expect(result.state.rows[0]?.entry.gasFlowUnit).toBe('L/min');
    expect(result.state.rows[0]?.entry.thicknessMin).toBe('');
    expect(result.state.rows[0]?.staged).toBeNull();
  });

  it('never parses a machine code as voltage even under a volts header', async () => {
    const result = await prepareLincolnPdfImport(source(await fictionalLincolnPdf('code-under-voltage')), emptyImportState());
    const row = result.state.rows[0]!;
    expect(row.manufacturerMachineSetting?.value).toBe('B-3');
    expect(row.entry.voltageMin).toBe('');
    expect(row.entry.amperageMin).toBe('');
    expect(row.entry.wireFeedMin).toBe('');
    expect(row.staged).toBeNull();
    expect(row.validationErrors.join(' ')).toContain('Machine code appears');
  });

  it.each(['blank', 'malformed'] as const)('retains %s rows as unsupported rather than filling cells', async (mode) => {
    const result = await prepareLincolnPdfImport(source(await fictionalLincolnPdf(mode)), emptyImportState());
    expect(result.categories?.unsupportedRows).toBe(1);
    expect(result.state.rows[0]?.validationErrors.length).toBeGreaterThan(0);
    expect(result.state.rows[0]?.manufacturerMachineSetting).toBeUndefined();
    expect(result.state.rows[0]?.staged).toBeNull();
    if (mode === 'malformed') expect(result.state.rows[0]?.raw).toMatchObject({ publishedRow: { runs: expect.arrayContaining([expect.objectContaining({ text: 'B-3' })]) } });
  });

  it('retains unsupported table layouts as parse failures for review', async () => {
    const result = await prepareLincolnPdfImport(source(await fictionalLincolnPdf('unsupported')), emptyImportState());
    expect(result.categories?.parseFailures).toBe(1);
    expect(result.state.rows).toHaveLength(1);
    expect(result.state.rows[0]?.validationErrors.join(' ')).toContain('unsupported');
  });

  it('does not assume every manual has a welding table and rejects malformed PDFs', async () => {
    await expect(extractLincolnPdf(await fictionalLincolnPdf('unlabeled'))).rejects.toThrow(/No supported Lincoln/);
    await expect(extractLincolnPdf(new TextEncoder().encode('Not a PDF'))).rejects.toThrow();
  });

  it('deduplicates by manual/page/table/context/setting even after PDF bytes change', async () => {
    const bytes = await fictionalLincolnPdf('duplicate');
    const first = await prepareLincolnPdfImport(source(bytes), emptyImportState());
    expect(first.addedRows).toBe(1);
    expect(first.categories?.duplicatesSkipped).toBe(1);
    const unchanged = await prepareLincolnPdfImport(source(bytes), first.state);
    expect(unchanged.addedRows).toBe(0);
    const changedBytes = new Uint8Array([...bytes, ...new TextEncoder().encode('\n% fictional revision metadata only\n')]);
    const changed = await prepareLincolnPdfImport(source(changedBytes), first.state);
    expect(changed.message).toBe('Source changed since previous import; review required.');
    expect(changed.addedRows).toBe(0);
    expect(changed.state.rows).toHaveLength(1);
  });

  it('allows a mocked official PDF download and CLI dry run without modifying staging', async () => {
    const bytes = await fictionalLincolnPdf();
    const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(new Uint8Array(bytes), { headers: { 'content-type': 'application/pdf' } }));
    const retrieved = await fetchSource(source(bytes).url, request);
    expect(retrieved.bytes).toEqual(Buffer.from(bytes));
    expect(retrieved.mediaType).toBe('pdf');
    const root = await mkdtemp(join(tmpdir(), 'lincoln-dry-run-'));
    const directory = join(root, 'staging');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await main(['--dry-run', '--url', source(bytes).url], { stagingDirectory: directory, request });
      expect(log.mock.calls.flat().join(' ')).toContain('machine-specific rows: 1');
      await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('writes the exact PDF snapshot and reloads machine-specific staging without duplicates', async () => {
    const bytes = await fictionalLincolnPdf();
    const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(new Uint8Array(bytes), { headers: { 'content-type': 'application/pdf' } }));
    const directory = await mkdtemp(join(tmpdir(), 'lincoln-write-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await main(['--url', source(bytes).url], { stagingDirectory: directory, request });
      const json = await readFile(join(directory, 'imports.json'), 'utf8');
      const rows = importStagedJson(json).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.manufacturerMachineSetting?.value).toBe('B-3');
      expect(rows[0]?.staged).toBeNull();
      expect(rows[0]?.reviewStatus).toBe('draft');
      expect(await readFile(join(directory, 'sources', `${hashSource(bytes)}.pdf`))).toEqual(Buffer.from(bytes));
      await main(['--url', source(bytes).url], { stagingDirectory: directory, request });
      expect(await readFile(join(directory, 'imports.json'), 'utf8')).toBe(json);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});