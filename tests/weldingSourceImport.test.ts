import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEsabParameters } from '../scripts/welding-source-import/parsers/esabParameters';
import { approvedSourceUrl } from '../scripts/welding-source-import/sourceRegistry';
import { fetchSource } from '../scripts/welding-source-import/fetchSource';
import { hashSource } from '../scripts/welding-source-import/hashSource';
import { emptyImportState, prepareSourceImport } from '../scripts/welding-source-import/importSource';
import { main } from '../scripts/welding-source-import/index';
import type { RetrievedSource } from '../scripts/welding-source-import/types';
import { importStagedJson } from '../src/features/welding/data/staging/importExport/json';
import { gmawSource } from './welding/fixtures';

afterEach(() => vi.restoreAllMocks());

function sourceFixture(html = fictionalProductHtml()): RetrievedSource {
  return {
    manufacturer: 'ESAB', url: 'https://esab.com/fictional-product', retrievedAt: '2026-10-02T00:00:00.000Z',
    html, bytes: new TextEncoder().encode(html),
  };
}

function fictionalProductHtml() {
  const fixture = gmawSource();
  return `<!doctype html><html><head><title>Fictional Product Chart</title></head><body>
    <h1>Fictional consumable</h1><h2 id="fixture-parameters">Recommended Welding Parameters</h2>
    <table id="fictional-table"><thead><tr>
    <th>Wire Diameter (${fixture.wireDiameter.unit})</th><th>Current (A)</th><th>Voltage (V)</th><th>Wire Feed Speed (${fixture.wireFeed.unit})</th>
    </tr></thead><tbody><tr>
    <td>${fixture.wireDiameter.value}</td><td>${fixture.amperage!.min} - ${fixture.amperage!.max}</td>
    <td>${fixture.voltage.min} - ${fixture.voltage.max}</td><td>${fixture.wireFeed.min} - ${fixture.wireFeed.max}</td>
    </tr></tbody></table></body></html>`;
}

describe('ESAB-style source table parser (fictional fixtures only)', () => {
  it('extracts only explicitly published parameter values and units', () => {
    const parsed = parseEsabParameters(fictionalProductHtml());
    expect(parsed.title).toBe('Fictional Product Chart');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.tableIdentifier).toBe('fictional-table');
    expect(parsed.rows[0]?.errors).toEqual([]);
    expect(parsed.rows[0]?.parameters.find((value) => value.kind === 'wireDiameter')).toMatchObject({
      unit: gmawSource().wireDiameter.unit,
      text: String(gmawSource().wireDiameter.value),
      min: String(gmawSource().wireDiameter.value),
    });
    expect(parsed.rows[0]?.parameters.find((value) => value.kind === 'wireFeed')?.unit).toBe(gmawSource().wireFeed.unit);
  });

  it('retains incomplete tables without guessing missing columns or units', () => {
    const html = fictionalProductHtml().replace(/<th>Wire Feed Speed[^<]*<\/th>/, '<th>Unspecified</th>')
      .replace('Wire Diameter (mm)', 'Wire Diameter');
    const parsed = parseEsabParameters(html);
    expect(parsed.rows[0]?.errors.join(' ')).toContain('No explicitly labeled wireFeed column');
    expect(parsed.rows[0]?.parameters.find((value) => value.kind === 'wireDiameter')?.unit).toBeUndefined();
  });

  it('rejects malformed HTML and unlabeled parameter tables', () => {
    expect(() => parseEsabParameters('<html><title>Fixture</title><table id="')).toThrow(/Malformed/);
    expect(() => parseEsabParameters(fictionalProductHtml().replace('Recommended Welding Parameters', 'Other data'))).toThrow(/No explicitly labeled/);
  });

  it('does not align cells automatically when the source row is malformed', () => {
    const source = gmawSource();
    const html = fictionalProductHtml().replace(`<td>${source.voltage.min} - ${source.voltage.max}</td>`, '');
    const row = parseEsabParameters(html).rows[0];
    expect(row?.errors.join(' ')).toContain('cells but');
    expect(row?.parameters).toEqual([]);
    expect(row?.cells).toHaveLength(3);
  });

  it('retains published imperial unit spelling without converting source values', () => {
    const html = fictionalProductHtml().replace('Wire Feed Speed (mm/min)', 'Wire Feed Speed (IPM)');
    const parsed = parseEsabParameters(html);
    expect(parsed.rows[0]?.parameters.find((value) => value.kind === 'wireFeed')?.unit).toBe('IPM');
    const result = prepareSourceImport(sourceFixture(html), emptyImportState());
    expect(result.state.rows[0]?.entry.wireFeedUnit).toBe('IPM');
    expect(result.state.rows[0]?.entry.wireFeedMin).toBe(String(gmawSource().wireFeed.min));
    expect(result.state.rows[0]?.validationErrors.join(' ')).toContain('wireFeedUnit');
  });
});

describe('official source allowlist', () => {
  it.each(['millerwelds.com', 'lincolnelectric.com', 'esab.com', 'www.esab.com'])('approves %s', (host) => {
    expect(approvedSourceUrl(`https://${host}/fixture`).source).toBeDefined();
  });

  it.each([
    'https://third-party.example/fixture', 'https://esab.com.evil.example/fixture',
    'https://evil-esab.com/fixture', 'http://esab.com/fixture', 'https://user:password@esab.com/fixture',
    'https://esab.com:8443/fixture', 'https://127.0.0.1/fixture',
  ])('rejects %s', (url) => {
    expect(() => approvedSourceUrl(url)).toThrow();
  });

  it('rejects an unapproved redirect before making its second request', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status: 302, headers: { location: 'https://third-party.example/fixture' },
    }));
    await expect(fetchSource('https://esab.com/fixture', request)).rejects.toThrow(/not approved/);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('fetches exact bytes from an approved source with automatic redirects disabled', async () => {
    const html = fictionalProductHtml();
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }));
    const result = await fetchSource('https://esab.com/fixture', request);
    expect(result.html).toBe(html);
    expect(result.bytes).toEqual(Buffer.from(html));
    expect(request.mock.calls[0]?.[1]?.redirect).toBe('manual');
  });
});

describe('unverified source-extracted staging', () => {
  it('preserves exact source units and provenance without inferring missing fields', () => {
    const result = prepareSourceImport(sourceFixture(), emptyImportState());
    const row = result.state.rows[0]!;
    expect(row.entry.wireDiameterUnit).toBe(gmawSource().wireDiameter.unit);
    expect(row.entry.wireFeedUnit).toBe(gmawSource().wireFeed.unit);
    for (const field of ['material', 'thicknessMin', 'gas', 'polarity', 'transferMode', 'gasFlowMin'] as const) expect(row.entry[field]).toBe('');
    expect(row.entry.joints).toEqual([]);
    expect(row.entry.positions).toEqual([]);
    expect(row.reviewStatus).toBe('draft');
    expect(row.readyForVerification).toBe(false);
    expect(row.staged).toBeNull();
    expect(row.raw).toMatchObject({
      origin: 'source-extracted', verified: false,
      provenance: { manufacturer: 'ESAB', sourceUrl: 'https://esab.com/fictional-product', documentTitle: 'Fictional Product Chart', sha256: hashSource(sourceFixture().bytes), parserVersion: '1.0.0' },
    });
    expect(importStagedJson(JSON.stringify(result.state)).rows[0]?.reviewStatus).toBe('draft');
  });

  it('does not duplicate an unchanged source', () => {
    const source = sourceFixture();
    const first = prepareSourceImport(source, emptyImportState());
    const duplicate = prepareSourceImport(source, first.state);
    expect(duplicate.status).toBe('unchanged');
    expect(duplicate.addedRows).toBe(0);
    expect(duplicate.state).toBe(first.state);
    expect(duplicate.state.rows).toHaveLength(1);
  });

  it('reports content hash changes and retains both versions for review', () => {
    const first = prepareSourceImport(sourceFixture(), emptyImportState());
    const changedSource = sourceFixture(fictionalProductHtml().replace('Fictional Product Chart', 'Fictional Product Chart Revision B'));
    const changed = prepareSourceImport(changedSource, first.state);
    expect(changed.message).toBe('Source changed since previous import; review required.');
    expect(changed.provenance.sha256).not.toBe(first.provenance.sha256);
    expect(changed.state.rows).toHaveLength(2);
    expect(changed.state.rows.every((row) => row.reviewStatus === 'draft')).toBe(true);
    const reverted = prepareSourceImport(sourceFixture(), changed.state);
    expect(reverted.state.rows).toHaveLength(2);
    expect(reverted.addedRows).toBe(0);
  });
});

describe('source importer CLI (mocked official responses only)', () => {
  it('dry-run fetches, parses and validates without creating staging files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'weld-source-test-'));
    const directory = join(root, 'staging');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(fictionalProductHtml(), { headers: { 'content-type': 'text/html' } }));
    try {
      await main(['--dry-run', '--url', 'https://esab.com/fixture'], { stagingDirectory: directory, request });
      expect(request).toHaveBeenCalledTimes(1);
      expect(log.mock.calls.flat().join(' ')).toContain('no staging files');
      await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('writes only unverified staging JSON and an exact-byte source snapshot, then skips duplicates', async () => {
    const root = await mkdtemp(join(tmpdir(), 'weld-source-write-'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(fictionalProductHtml(), { headers: { 'content-type': 'text/html' } }));
    try {
      await main(['--url', 'https://esab.com/fixture'], { stagingDirectory: root, request });
      const before = await readFile(join(root, 'imports.json'), 'utf8');
      const rows = importStagedJson(before).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.reviewStatus).toBe('draft');
      const snapshot = await readFile(join(root, 'sources', `${hashSource(sourceFixture().bytes)}.html`), 'utf8');
      expect(snapshot).toBe(fictionalProductHtml());
      await main(['--url', 'https://esab.com/fixture'], { stagingDirectory: root, request });
      expect(await readFile(join(root, 'imports.json'), 'utf8')).toBe(before);
      expect(log.mock.calls.flat().join(' ')).toContain('Source unchanged');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});