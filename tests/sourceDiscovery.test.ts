import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fictionalLincolnPdf } from './fixtures/lincolnPdf';
import { analyzeCandidate, discoverOfficialSources, type DiscoveryIndex } from '../scripts/welding-source-import/discovery';
import { main } from '../scripts/welding-source-import/discover';
import { OFFICIAL_SCAN_SOURCES } from '../scripts/welding-source-import/sources';
import type { RetrievedSource } from '../scripts/welding-source-import/types';

afterEach(() => vi.restoreAllMocks());

const ESAB_URL = OFFICIAL_SCAN_SOURCES.find((source) => source.manufacturer === 'ESAB')!.url;
const LINCOLN_URL = OFFICIAL_SCAN_SOURCES.find((source) => source.manufacturer === 'Lincoln Electric')!.url;
const MILLER_URL = OFFICIAL_SCAN_SOURCES.find((source) => source.manufacturer === 'Miller')!.url;
const CAPABILITY_URL = 'https://esab.com/us/nam_en/resources/fictional-machine-capability/';
const ESAB_HTML = `<!doctype html><html><head><title>Fictional Exaton GMAW Product</title></head><body>
<h2>Recommended Welding Parameters</h2><table><tr><th>Material</th><th>Material Thickness (mm)</th><th>Wire Diameter (mm)</th><th>Voltage (V)</th><th>Current (A)</th><th>Wire Feed Speed (m/min)</th></tr>
<tr><td>Fictional steel</td><td>2-4</td><td>0.9</td><td>18-20</td><td>80-100</td><td>4-6</td></tr></table><p>GMAW</p></body></html>`;

function htmlSource(url: string, html: string): RetrievedSource {
  return { url, manufacturer: 'ESAB', retrievedAt: '2026-10-02T00:00:00.000Z', bytes: new TextEncoder().encode(html), html, mediaType: 'html' };
}

function responseForEsab(url: string, page = ESAB_HTML): Response {
  if (url === 'https://esab.com/robots.txt') return new Response('User-agent: *\nAllow: /\nSitemap: https://esab.com/sitemap.xml', { headers: { 'content-type': 'text/plain' } });
  if (url === 'https://esab.com/sitemap.xml') return new Response(`<urlset><url><loc>${ESAB_URL}</loc></url><url><loc>${ESAB_URL}</loc></url></urlset>`, { headers: { 'content-type': 'application/xml' } });
  if (url === ESAB_URL) return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  return new Response('', { status: 404 });
}

function mockedEsabFetch(page = ESAB_HTML) {
  return vi.fn<typeof fetch>(async (input) => responseForEsab(String(input), page));
}

function mockedEsabWithCapability(): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === 'https://esab.com/robots.txt') return new Response('User-agent: *\nAllow: /\nSitemap: https://esab.com/sitemap.xml', { headers: { 'content-type': 'text/plain' } });
    if (url === 'https://esab.com/sitemap.xml') return new Response(`<urlset><url><loc>${ESAB_URL}</loc></url><url><loc>${CAPABILITY_URL}</loc></url></urlset>`, { headers: { 'content-type': 'application/xml' } });
    if (url === CAPABILITY_URL) return new Response('<html><head><title>Fictional machine</title></head><body><h2>Machine Capabilities</h2><table><tr><th>Voltage Range (V)</th><th>Wire Feed Speed (IPM)</th></tr><tr><td>15-25</td><td>50-500</td></tr></table><p>GMAW</p></body></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
    return responseForEsab(url);
  });
}

describe('official welding-source discovery (fictional local documents)', () => {
  it('rates a structured parameter table and detects only explicitly labeled fields and units', async () => {
    const candidate = await analyzeCandidate(htmlSource(ESAB_URL, ESAB_HTML), 'fictional-esab-source');
    expect(candidate.readability).toBe('excellent');
    expect(candidate.fieldsDetected).toEqual(expect.arrayContaining(['material thickness', 'material', 'wire diameter', 'voltage', 'amperage/current', 'wire feed speed']));
    expect(candidate.evidence.explicitUnits).toBe(true);
    expect(candidate.suitability).toBe('generic-recommendation');
    expect(candidate.fieldsMissing).toContain('gas flow');
  });

  it('classifies marketing text and unlabeled numeric values as unsupported without guessing fields', async () => {
    const html = '<!doctype html><html><head><title>Fictional Welding Equipment</title></head><body><h1>Precision and power</h1><p>50-250 and 18-24 for high performance.</p></body></html>';
    const candidate = await analyzeCandidate(htmlSource('https://esab.com/fictional/product/', html), 'marketing-only');
    expect(candidate.readability).toBe('unsupported');
    expect(candidate.fieldsDetected).toEqual([]);
    expect(candidate.fieldsMissing).toContain('material thickness');
  });

  it('does not label unrelated product forms as interactive calculators based on footer text', async () => {
    const html = '<html><head><title>Fictional TIG Torch</title></head><body><h1>TIG Torch</h1><form><input name="email"></form><footer>See our weld setting calculators</footer></body></html>';
    const candidate = await analyzeCandidate(htmlSource('https://esab.com/fictional/product/tig-torch/', html), 'torch-product');
    expect(candidate.sourceType).toBe('manufacturer-product-page');
    expect(candidate.evidence.interactiveOnly).toBe(false);
    expect(candidate.readability).toBe('unsupported');
  });

  it('does not infer material or shielding gas from adjacent thickness or gas-flow labels', async () => {
    const html = '<html><head><title>Fictional chart GMAW</title></head><body><table><tr><th>Material Thickness (mm)</th><th>Wire Diameter (mm)</th><th>Voltage (V)</th><th>Current (A)</th><th>Gas Flow (L/min)</th></tr><tr><td>2</td><td>0.9</td><td>18</td><td>80</td><td>12</td></tr></table></body></html>';
    const candidate = await analyzeCandidate(htmlSource('https://esab.com/fictional/filler-chart/', html), 'no-inferred-context');
    expect(candidate.fieldsDetected).not.toContain('material');
    expect(candidate.fieldsDetected).not.toContain('shielding gas');
    expect(candidate.fieldsDetected).toContain('gas flow');
    expect(candidate.suitability).toBe('consumable-reference');
  });

  it('requires units for every detected parameter field before rating explicit units', async () => {
    const html = '<html><head><title>Fictional chart GMAW</title></head><body><table><tr><th>Wire Diameter (mm)</th><th>Voltage</th><th>Current (A)</th><th>Wire Feed Speed (m/min)</th></tr><tr><td>0.9</td><td>18-20</td><td>80-100</td><td>4-6</td></tr></table></body></html>';
    const candidate = await analyzeCandidate(htmlSource('https://esab.com/fictional/parameter-chart/', html), 'missing-voltage-unit');
    expect(candidate.evidence.explicitUnits).toBe(false);
    expect(candidate.readability).toBe('manual-review');
  });

  it('distinguishes machine-capability and machine-specific tables', async () => {
    const capability = '<html><head><title>Fictional machine</title></head><body><h2>Machine Capabilities</h2><table><tr><th>Voltage Range (V)</th><th>Wire Feed Speed (IPM)</th></tr><tr><td>15-25</td><td>50-500</td></tr></table></body></html>';
    const machine = '<html><head><title>Fictional machine</title></head><body><h2>Machine Control Settings</h2><table><tr><th>Setting</th></tr><tr><td>A-2</td></tr></table></body></html>';
    expect((await analyzeCandidate(htmlSource('https://esab.com/fictional/capability/', capability), 'capability')).suitability).toBe('machine-capability');
    const machineCandidate = await analyzeCandidate(htmlSource('https://esab.com/fictional/machine/', machine), 'machine-specific');
    expect(machineCandidate.suitability).toBe('machine-specific');
    expect(machineCandidate.fieldsDetected).not.toContain('voltage');
  });

  it('reports missing thickness as consumable-reference rather than a generic recommendation', async () => {
    const html = ESAB_HTML.replace('<th>Material</th><th>Material Thickness (mm)</th>', '<th>Material</th>');
    const candidate = await analyzeCandidate(htmlSource(ESAB_URL, html), 'missing-thickness');
    expect(candidate.readability).toBe('excellent');
    expect(candidate.fieldsMissing).toContain('material thickness');
    expect(candidate.suitability).toBe('consumable-reference');
  });

  it('marks ambiguous PDF tables for manual review while preserving explicit machine-setting classification', async () => {
    const bytes = await fictionalLincolnPdf();
    const pdf: RetrievedSource = { url: LINCOLN_URL, manufacturer: 'Lincoln Electric', retrievedAt: '2026-10-02T00:00:00.000Z', bytes, html: '', mediaType: 'pdf' };
    const candidate = await analyzeCandidate(pdf, 'fictional-lincoln-pdf');
    expect(candidate.evidence.pdfMachineText).toBe(true);
    expect(candidate.suitability).toBe('machine-specific');
    expect(candidate.fieldsDetected).not.toContain('voltage');
  });

  it('deduplicates sitemap URLs and applies manufacturer and process filters', async () => {
    const request = mockedEsabFetch();
    const index: DiscoveryIndex = { format: 'weldcalc-source-discovery-index', version: 1, sources: [] };
    const result = await discoverOfficialSources({ manufacturer: 'esab', process: 'GMAW' }, { request, wait: async () => {}, index });
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0]?.manufacturer).toBe('ESAB');
    expect(result.candidates[0]?.process).toBe('GMAW');
    expect(result.index.sources).toHaveLength(1);
    expect(request.mock.calls.map(([input]) => String(input)).some((url) => url.includes('millerwelds.com') || url.includes('lincolnelectric.com'))).toBe(false);
    const noMatch = await discoverOfficialSources({ manufacturer: 'esab', process: 'FCAW' }, { request: mockedEsabFetch(), wait: async () => {} });
    expect(noMatch.candidates).toHaveLength(0);
  });

  it('discovers linked official PDFs and filters Miller overview candidates by any explicitly advertised process', async () => {
    const pdfUrl = 'https://esab.com/us/nam_en/manuals/fictional.pdf';
    const pdfBytes = await fictionalLincolnPdf();
    const linkedPdfFetch = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /\nSitemap: https://esab.com/sitemap.xml', { headers: { 'content-type': 'text/plain' } });
      if (url === 'https://esab.com/sitemap.xml') return new Response(`<urlset><url><loc>${ESAB_URL}</loc></url></urlset>`, { headers: { 'content-type': 'application/xml' } });
      if (url === ESAB_URL) return new Response(ESAB_HTML.replace('</body>', `<a href="${pdfUrl}">Technical Data Sheet PDF</a></body>`), { headers: { 'content-type': 'text/html' } });
      if (url === pdfUrl) return new Response(new Uint8Array(pdfBytes), { headers: { 'content-type': 'application/pdf' } });
      return new Response('', { status: 404 });
    });
    const linked = await discoverOfficialSources({ manufacturer: 'esab' }, { request: linkedPdfFetch, wait: async () => {} });
    expect(linked.candidates.some((candidate) => candidate.sourceUrl === pdfUrl && candidate.sourceType === 'pdf-table')).toBe(true);

    const millerOverview = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === 'https://www.millerwelds.com/robots.txt') return new Response('User-agent: *\nAllow: /\nSitemap: https://www.millerwelds.com/sitemap.xml', { headers: { 'content-type': 'text/plain' } });
      if (url === 'https://www.millerwelds.com/sitemap.xml') return new Response(`<urlset><url><loc>${MILLER_URL}</loc></url></urlset>`, { headers: { 'content-type': 'application/xml' } });
      if (url === MILLER_URL) return new Response('<html><head><title>Weld Setting Calculators</title></head><body><h1>Weld Setting Calculators</h1><p>MIG, Flux-Cored, TIG, Stick</p></body></html>', { headers: { 'content-type': 'text/html' } });
      return new Response('', { status: 404 });
    });
    const stick = await discoverOfficialSources({ manufacturer: 'miller', process: 'SMAW' }, { request: millerOverview, wait: async () => {} });
    expect(stick.candidates).toHaveLength(1);
    expect(stick.candidates[0]).toMatchObject({ process: null, processes: ['GMAW', 'FCAW', 'GTAW', 'SMAW'], readability: 'unsupported', suitability: 'unsupported' });
  });

  it('obeys robots path restrictions and marks 403 without retrying or bypassing', async () => {
    const disallowed = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /us/nam_en/products-solutions/', { headers: { 'content-type': 'text/plain' } });
      if (url.endsWith('/sitemap.xml')) return new Response(`<urlset><url><loc>${ESAB_URL}</loc></url></urlset>`, { headers: { 'content-type': 'application/xml' } });
      return new Response('', { status: 500 });
    });
    const result = await discoverOfficialSources({ manufacturer: 'esab' }, { request: disallowed, wait: async () => {} });
    expect(result.candidates[0]?.reason).toContain('robots.txt disallows');
    expect(disallowed.mock.calls.map(([input]) => String(input)).includes(ESAB_URL)).toBe(false);

    const blocked = vi.fn<typeof fetch>(async (input) => String(input).endsWith('/robots.txt')
      ? new Response('', { status: 404 })
      : String(input) === 'https://esab.com/sitemap.xml'
        ? new Response(`<urlset><url><loc>${ESAB_URL}</loc></url></urlset>`, { headers: { 'content-type': 'application/xml' } })
        : new Response('', { status: 403 }));
    const blockedResult = await discoverOfficialSources({ manufacturer: 'esab' }, { request: blocked, wait: async () => {} });
    expect(blockedResult.candidates[0]?.evidence.blockedBy403).toBe(true);
    expect(blocked.mock.calls.map(([input]) => String(input)).filter((url) => url === ESAB_URL)).toHaveLength(1);
  });

  it('honors robots crawl delays longer than one minute', async () => {
    const waits: number[] = [];
    const request = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /\nCrawl-delay: 65\nSitemap: https://esab.com/sitemap.xml', { headers: { 'content-type': 'text/plain' } });
      if (url.endsWith('/sitemap.xml')) return new Response(`<urlset><url><loc>${ESAB_URL}</loc></url></urlset>`, { headers: { 'content-type': 'application/xml' } });
      return new Response('', { status: 403 });
    });
    await discoverOfficialSources({ manufacturer: 'esab' }, { request, wait: async (milliseconds) => { waits.push(milliseconds); } });
    expect(waits.some((milliseconds) => milliseconds > 60_000)).toBe(true);
  });

  it('does not follow redirects before checking destination robots rules', async () => {
    const request = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /\nSitemap: https://esab.com/sitemap.xml', { headers: { 'content-type': 'text/plain' } });
      if (url.endsWith('/sitemap.xml')) return new Response(`<urlset><url><loc>${ESAB_URL}</loc></url></urlset>`, { headers: { 'content-type': 'application/xml' } });
      if (url === ESAB_URL) return new Response('', { status: 302, headers: { location: '/redirected-product/' } });
      return new Response('', { status: 404 });
    });
    const result = await discoverOfficialSources({ manufacturer: 'esab' }, { request, wait: async () => {} });
    expect(result.candidates[0]?.reason).toContain('destination robots rules have not been checked');
    expect(request.mock.calls.map(([input]) => String(input))).not.toContain('https://esab.com/redirected-product/');
  });

  it('imports only supported excellent/good candidates through the existing unverified staging path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'welding-discovery-import-good-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const result = await main(['--manufacturer', 'esab', '--import-good'], {
        stagingDirectory: root, request: mockedEsabWithCapability(), wait: async () => {}, now: () => '2026-10-02T12:00:00.000Z',
      });
      const capability = result.candidates.find((candidate) => candidate.sourceUrl === CAPABILITY_URL);
      expect(capability).toMatchObject({ readability: 'good', suitability: 'machine-capability', importerSupported: false });
      expect(result.imports).toHaveLength(1);
      expect(result.imports[0]?.status).toBe('imported');
      expect(result.state?.rows).toHaveLength(1);
      expect(result.state?.rows[0]).toMatchObject({ readyForVerification: false, reviewStatus: 'draft', raw: { verified: false } });
      const index = JSON.parse(await readFile(join(root, 'discovery-index.json'), 'utf8')) as { sources: { url: string }[] };
      expect(index.sources).toHaveLength(2);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});