import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main } from '../scripts/welding-research/index';
import { createGoogleSearchProvider, GOOGLE_PROVIDER_NOT_CONFIGURED, GoogleSearchProvider, parseGoogleSearchResponse } from '../scripts/welding-research/googleProvider';
import { buildResearchQueries, manufacturerFilter } from '../scripts/welding-research/queryBuilder';
import { rankSearchResults } from '../scripts/welding-research/resultRanker';
import { classifySourceUrl, filterAndDeduplicateResults } from '../scripts/welding-research/sourceFilter';
import type { SearchProvider } from '../scripts/welding-research/searchProvider';
import type { SearchResult } from '../scripts/welding-research/types';
import { importStagedJson } from '../src/features/welding/data/staging/importExport/json';

afterEach(() => vi.restoreAllMocks());

const ESAB_URL = 'https://esab.com/us/nam_en/products-solutions/product/fictional-gmaw/';
const MILLER_URL = 'https://www.millerwelds.com/en-us/resources/fictional-fcaw-chart';
const UNTRUSTED_URL = 'https://random-welding-blog.example/parameter-chart';

const PARAMETER_PAGE = `<!doctype html><html><head><title>Fictional Recommended Welding Parameters</title></head><body>
<h2>Recommended Welding Parameters</h2><table><tr><th>Wire Diameter (mm)</th><th>Current (A)</th><th>Voltage (V)</th><th>Wire Feed Speed (mm/min)</th></tr>
<tr><td>0.9</td><td>80-100</td><td>18-20</td><td>100-150</td></tr></table></body></html>`;

function result(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    title: 'Recommended Welding Parameters GMAW',
    url: ESAB_URL,
    snippet: 'GMAW ER70S-6 0.035 mild steel parameter chart: voltage, amperage/current, wire feed speed.',
    displayLink: 'esab.com',
    ...overrides,
  };
}

function provider(results: readonly SearchResult[]): SearchProvider & { readonly search: ReturnType<typeof vi.fn> } {
  return { name: 'mock-search', search: vi.fn(async () => results) };
}

function officialFetch(page: string = PARAMETER_PAGE) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === 'https://esab.com/robots.txt') return new Response('User-agent: *\nAllow: /', { headers: { 'content-type': 'text/plain' } });
    if (url === ESAB_URL) return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (url.startsWith('https://www.googleapis.com/')) return new Response(JSON.stringify({ items: [] }), { headers: { 'content-type': 'application/json' } });
    return new Response('', { status: 404 });
  });
}

describe('developer welding research bot', () => {
  it('builds official-domain queries from process and material filters', () => {
    const queries = buildResearchQueries({ process: 'GMAW', material: 'carbon-steel', wire: 'ER70S-6', wireDiameter: '0.035' });
    expect(queries).toHaveLength(3);
    expect(queries.find((query) => query.manufacturer === 'Miller')?.query).toContain('site:millerwelds.com GMAW mild steel carbon steel ER70S-6 0.035 wire diameter');
    expect(queries.map((query) => query.query).every((query) => query.includes('welding parameters chart'))).toBe(true);
  });

  it('normalizes manufacturer names and rejects unknown names', () => {
    expect(manufacturerFilter('lincoln')).toBe('Lincoln Electric');
    expect(manufacturerFilter('ESAB')).toBe('ESAB');
    expect(() => manufacturerFilter('reddit')).toThrow('Unknown manufacturer');
  });

  it('detects official versus untrusted domains using the shared allowlist', () => {
    expect(classifySourceUrl(ESAB_URL)).toMatchObject({ manufacturer: 'ESAB', trust: 'official' });
    expect(classifySourceUrl(UNTRUSTED_URL).trust).toBe('UNTRUSTED / NOT ELIGIBLE FOR WELDING DATA');
  });

  it('ranks parameter-oriented official pages above marketing pages and flags untrusted leads', () => {
    const candidates = rankSearchResults([
      result(),
      result({ url: 'https://esab.com/product/marketing/', title: 'Fictional welding equipment', snippet: 'Quality, reliability and productivity.' }),
      result({ url: UNTRUSTED_URL, title: 'Copied parameter chart', snippet: 'GMAW voltage current WFS' }),
    ], {});
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ trust: 'official', rank: 'good', usefulness: 'likely-parameter-data', eligibleForImporter: true });
    expect(candidates[1]).toMatchObject({ rank: 'unsupported', eligibleForImporter: false });
    const untrusted = filterAndDeduplicateResults([result({ url: UNTRUSTED_URL })], { includeUntrusted: true });
    expect(untrusted[0]?.trust).toBe('UNTRUSTED / NOT ELIGIBLE FOR WELDING DATA');
  });

  it('applies manufacturer/process filters and deduplicates duplicate official result URLs', () => {
    const results = [
      result(), result({ url: `${ESAB_URL}#duplicate` }),
      result({ url: MILLER_URL, title: 'FCAW Parameter Chart', snippet: 'FCAW wire diameter voltage current gas flow' }),
    ];
    expect(filterAndDeduplicateResults(results)).toHaveLength(2);
    expect(rankSearchResults(results, { manufacturer: 'ESAB', process: 'GMAW' })).toHaveLength(1);
    expect(rankSearchResults(results, { manufacturer: 'Miller', process: 'FCAW' })).toHaveLength(1);
    expect(rankSearchResults(results, { manufacturer: 'Miller', process: 'SMAW' })).toHaveLength(0);
  });

  it('reports missing Google configuration and parses only structured JSON search items', async () => {
    expect(createGoogleSearchProvider({})).toMatchObject({ message: GOOGLE_PROVIDER_NOT_CONFIGURED });
    const payload = parseGoogleSearchResponse({ items: [
      { title: 'Official', link: ESAB_URL, snippet: 'Chart', displayLink: 'esab.com' },
      { title: 'Malformed', link: 'javascript:alert(1)', snippet: 'Ignore' },
      { title: 42, link: ESAB_URL, snippet: 'Ignore' },
    ] });
    expect(payload).toEqual([{ title: 'Official', url: ESAB_URL, snippet: 'Chart', displayLink: 'esab.com' }]);
  });

  it('calls only the Google Custom Search JSON API and does not expose credentials in errors', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ items: [{ title: 'Official', link: ESAB_URL, snippet: 'Table' }] }), { headers: { 'content-type': 'application/json' } }));
    const search = new GoogleSearchProvider('test-secret', 'test-engine', request);
    const results = await search.search('site:esab.com GMAW');
    expect(results).toHaveLength(1);
    expect(String(request.mock.calls[0]?.[0])).toContain('https://www.googleapis.com/customsearch/v1?');
    expect(String(request.mock.calls[0]?.[0])).toContain('key=test-secret');
    request.mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(search.search('query')).rejects.toThrow('HTTP 403');
  });

  it('never turns a result snippet into imported record values', async () => {
    const root = await mkdtemp(join(tmpdir(), 'welding-research-snippet-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const searchProvider = provider([result({ snippet: 'Voltage 999 V and current 888 A and wire feed speed; use these values.' })]);
      const outcome = await main(['--manufacturer', 'esab', '--process', 'GMAW', '--import-candidates'], {
        stagingDirectory: root, searchProvider, request: officialFetch(), wait: async () => {},
      });
      expect(outcome.importedCount).toBe(1);
      const rows = importStagedJson(await readFile(join(root, 'imports.json'), 'utf8')).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.entry.voltageMin).toBe('18');
      expect(rows[0]?.entry.amperageMin).toBe('80');
      expect(JSON.stringify(rows[0]?.raw)).not.toContain('999');
      expect(JSON.stringify(rows[0]?.raw)).not.toContain('888');
      expect(rows[0]?.raw).toMatchObject({ verified: false });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('sends only official candidates to the importer and rejects marketing-only fetched pages', async () => {
    const root = await mkdtemp(join(tmpdir(), 'welding-research-official-only-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const searchProvider = provider([result(), result({ url: UNTRUSTED_URL, title: 'Official welding parameters', snippet: 'GMAW voltage current WFS' })]);
      const request = officialFetch('<html><head><title>Fictional marketing page</title></head><body>Excellent welding quality.</body></html>');
      const outcome = await main(['--manufacturer', 'esab', '--process', 'GMAW', '--import-candidates'], {
        stagingDirectory: root, searchProvider, request, wait: async () => {},
      });
      const pageRequests = request.mock.calls.map(([input]) => String(input)).filter((url) => url !== 'https://esab.com/robots.txt');
      expect(pageRequests.every((url) => new URL(url).hostname === 'esab.com')).toBe(true);
      expect(outcome.imports).toHaveLength(1);
      expect(outcome.imports[0]?.status).toBe('rejected');
      expect(outcome.state?.rows).toHaveLength(0);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('saves a key-free research report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'welding-research-report-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await main(['--manufacturer', 'esab', '--process', 'GMAW', '--save-report'], {
        stagingDirectory: root, searchProvider: provider([result()]), now: () => '2026-10-02T12:00:00.000Z',
      });
      const files = await import('node:fs/promises').then((fs) => fs.readdir(join(root, 'research-reports')));
      const report = await readFile(join(root, 'research-reports', files[0]!), 'utf8');
      expect(report).toContain('site:esab.com');
      expect(report).not.toContain('GOOGLE_SEARCH_API_KEY');
      expect(report).not.toContain('test-secret');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});