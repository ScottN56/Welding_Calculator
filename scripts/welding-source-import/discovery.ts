import { load } from 'cheerio';
import { parseEsabParameters } from './parsers/esabParameters';
import { extractPdfText, parseLincolnPdfTables } from './parsers/lincolnPdfTables';
import { MILLER_TABLE_TITLES, parseMillerSource } from './parsers/millerSource';
import { OFFICIAL_SCAN_SOURCES } from './sources';
import { approvedSourceUrl } from './sourceRegistry';
import { hashSource } from './hashSource';
import type { Manufacturer, RetrievedSource } from './types';
import type { WeldingProcess } from '../../src/features/welding/types';

export type ReadabilityRating = 'excellent' | 'good' | 'manual-review' | 'unsupported';
export type CalculatorSuitability = 'generic-recommendation' | 'machine-specific' | 'machine-capability' | 'consumable-reference' | 'unsupported';
export type DiscoveredSourceType = 'manufacturer-product-page' | 'resource-page' | 'technical-data-sheet' | 'pdf-table' | 'interactive-calculator' | 'welding-guide';

export interface DiscoveryEvidence {
  readonly structuredHtmlTable: boolean;
  readonly embeddedJson: boolean;
  readonly pdfMachineText: boolean;
  readonly explicitParameterColumns: boolean;
  readonly thicknessContext: boolean;
  readonly materialContext: boolean;
  readonly consumableContext: boolean;
  readonly explicitUnits: boolean;
  readonly blockedBy403: boolean;
  readonly interactiveOnly: boolean;
  readonly ambiguousPdfTable: boolean;
}

export interface DiscoveryCandidate {
  readonly manufacturer: Manufacturer;
  readonly sourceId: string;
  readonly sourceUrl: string;
  readonly title: string;
  readonly process: WeldingProcess | null;
  readonly processes?: readonly WeldingProcess[];
  readonly sourceType: DiscoveredSourceType;
  readonly readability: ReadabilityRating;
  readonly fieldsDetected: readonly string[];
  readonly fieldsMissing: readonly string[];
  readonly likelyAdapter: string;
  readonly suitability: CalculatorSuitability;
  readonly reason: string;
  readonly evidence: DiscoveryEvidence;
  readonly sourceHash?: string;
  readonly importerSupported: boolean;
  readonly importResult?: string;
}

export interface DiscoveryIndexEntry {
  readonly url: string;
  readonly sourceId: string;
  readonly manufacturer: Manufacturer;
  readonly discoveredAt: string;
  readonly lastCheckedAt: string;
  readonly sourceHash?: string;
  readonly suitability: CalculatorSuitability;
}

export interface DiscoveryIndex {
  readonly format: 'weldcalc-source-discovery-index';
  readonly version: 1;
  readonly sources: readonly DiscoveryIndexEntry[];
}

export interface DiscoveryRunResult {
  readonly candidates: readonly DiscoveryCandidate[];
  readonly index: DiscoveryIndex;
  readonly importedSources: readonly RetrievedSource[];
  readonly warnings: readonly string[];
}

interface RobotsPolicy {
  readonly rules: readonly { allow: boolean; path: string }[];
  readonly sitemapUrls: readonly string[];
  readonly crawlDelayMs: number;
  readonly accessible: boolean;
  allows(pathname: string): boolean;
}

interface ResourceResult {
  readonly status: number;
  readonly url: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

const MAX_RESOURCE_BYTES = 5 * 1024 * 1024;
const MAX_SITEMAP_BYTES = 20 * 1024 * 1024;
const MAX_SITEMAPS_PER_HOST = 4;
const MAX_CANDIDATES_PER_MANUFACTURER = 8;
const MAX_DISCOVERED_URLS = 300;
const USER_AGENT = 'WeldCalculator-SourceReview';
const MANUFACTURER_ROOTS: Readonly<Record<Manufacturer, string>> = {
  Miller: 'https://www.millerwelds.com/',
  'Lincoln Electric': 'https://www.lincolnelectric.com/',
  ESAB: 'https://esab.com/',
};
const FIELD_LABELS: readonly [string, RegExp][] = [
  ['material thickness', /\bmaterial\s+thickness\b|\bthickness\b/i],
  ['material', /\bmaterial(?!\s+thickness\b)(?:\s+(?:type|grade|class))?\b|\bbase\s+metal\b/i],
  ['wire diameter', /\bwire\s+diameter\b|\bwire\s+size\b/i],
  ['electrode diameter', /\belectrode\s+diameter\b|\belectrode\s+size\b/i],
  ['voltage', /\bvoltage\b|\bvolts?\b/i],
  ['amperage/current', /\bamperage\b|\bcurrent\b|\bamps?\b/i],
  ['wire feed speed', /\bwire[ -]?feed(?:\s+speed)?\b|\bwfs\b|\bipm\b|\bm\/min\b/i],
  ['shielding gas', /\bshielding\s+gas\b|\bgas\b(?!\s+flow\b)/i],
  ['gas flow', /\bgas\s+flow\b|\bcfh\b|\bl\/min\b/i],
  ['polarity', /\bpolarity\b/i],
  ['transfer mode', /\btransfer\s+mode\b|\bshort[ -]?circuit\b|\bpulsed?\s+spray\b/i],
  ['position', /\bposition\b|\bflat\b|\boverhead\b|\bvertical\b/i],
];
const EXPECTED_FIELDS = ['material thickness', 'material', 'wire diameter/electrode diameter', 'voltage', 'amperage/current', 'wire feed speed', 'shielding gas', 'gas flow', 'polarity', 'transfer mode', 'position'];
const SETTING_FIELDS = new Set(['voltage', 'amperage/current', 'wire feed speed', 'gas flow']);
const CANDIDATE_PATH = /weld|welding|filler|consumable|product|technical|manual|application|parameter|calculator|resource|wire|electrode|mig|tig|stick|flux|\.pdf|datasheet|data-sheet/i;
const EXCLUDED_PATH = /(?:^|\/)(?:blog|blogs|news|press|forum|community|reddit|article|events?)(?:\/|$)/i;

function detectedProcesses(text: string): WeldingProcess[] {
  const found = new Set<WeldingProcess>();
  if (/\bGMAW\b|\bMIG\b|\bMAG\b|\bMIG\/MAG\b/i.test(text)) found.add('GMAW');
  if (/\bFCAW\b|flux[ -]?cored|innershield/i.test(text)) found.add('FCAW');
  if (/\bGTAW\b|\bTIG\b/i.test(text)) found.add('GTAW');
  if (/\bSMAW\b|\bstick(?:\s+welding)?\b/i.test(text)) found.add('SMAW');
  return [...found];
}

function sourceIdFor(manufacturer: Manufacturer, url: string): string {
  const existing = OFFICIAL_SCAN_SOURCES.find((source) => source.manufacturer === manufacturer && source.url === url);
  return existing?.id ?? `discovered-${manufacturer.toLowerCase().replace(/\s+/g, '-')}-${hashSource(new TextEncoder().encode(url)).slice(0, 16)}`;
}

function parseRobots(text: string): RobotsPolicy {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[]; delay: number }[] = [];
  const sitemaps: string[] = [];
  let current: { agents: string[]; rules: { allow: boolean; path: string }[]; delay: number } | undefined;
  let hasDirectives = false;
  for (const sourceLine of text.split(/\r?\n/)) {
    const line = sourceLine.split('#')[0]?.trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (name === 'sitemap') {
      try { sitemaps.push(approvedSourceUrl(value).url.href); } catch { /* External sitemap references are intentionally ignored. */ }
    } else if (name === 'user-agent') {
      if (!current || hasDirectives) {
        current = { agents: [], rules: [], delay: 0 };
        groups.push(current);
        hasDirectives = false;
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (name === 'allow' || name === 'disallow' || name === 'crawl-delay')) {
      hasDirectives = true;
      if (name === 'crawl-delay') {
        const seconds = Number(value);
        if (Number.isFinite(seconds) && seconds >= 0 && seconds <= Number.MAX_SAFE_INTEGER / 1000) current.delay = seconds * 1000;
      } else if (value) current.rules.push({ allow: name === 'allow', path: value });
    }
  }
  const matching = groups.filter((group) => group.agents.some((agent) => agent === '*' || USER_AGENT.toLowerCase().includes(agent)));
  const rules = matching.flatMap((group) => group.rules);
  const crawlDelayMs = Math.max(0, ...matching.map((group) => group.delay));
  const allows = (pathname: string) => {
    const matched = rules.filter((rule) => robotsRuleMatches(rule.path, pathname)).sort((left, right) => right.path.length - left.path.length)[0];
    return !matched || matched.allow;
  };
  return { rules, sitemapUrls: [...new Set(sitemaps)], crawlDelayMs, accessible: true, allows };
}

function robotsRuleMatches(rule: string, pathname: string): boolean {
  const anchored = rule.endsWith('$');
  const source = anchored ? rule.slice(0, -1) : rule;
  const expression = source.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${expression}${anchored ? '$' : ''}`).test(pathname);
}

async function readResource(
  input: string,
  manufacturer: Manufacturer,
  request: typeof fetch,
  wait: (milliseconds: number) => Promise<void>,
  nextAllowedAt: Map<string, number>,
  crawlDelayMs: number,
  maxBytes = MAX_RESOURCE_BYTES,
): Promise<ResourceResult> {
  const initial = approvedSourceUrl(input);
  if (initial.source.manufacturer !== manufacturer) throw new Error('Discovery cannot cross approved manufacturer domains.');
  const current = initial.url;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const approved = approvedSourceUrl(current.href);
    if (approved.source.manufacturer !== manufacturer) throw new Error('Discovery redirect left the approved manufacturer domain.');
    const waitUntil = nextAllowedAt.get(current.hostname) ?? 0;
    const remaining = waitUntil - Date.now();
    if (remaining > 0) await wait(remaining);
    nextAllowedAt.set(current.hostname, Date.now() + crawlDelayMs);
    const response = await request(current.href, {
      redirect: 'manual', signal: AbortSignal.timeout(15_000),
      headers: { Accept: 'text/plain, application/xml, text/xml, text/html, application/pdf', 'User-Agent': `${USER_AGENT}/1.0` },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Official redirect has no Location header.');
      const destination = approvedSourceUrl(new URL(location, current).href);
      if (destination.source.manufacturer !== manufacturer) throw new Error('Discovery redirect left the approved manufacturer domain.');
      throw new Error('Official redirect not followed because destination robots rules have not been checked.');
    }
    if (!response.ok) {
      await response.body?.cancel();
      return { status: response.status, url: current.href, contentType: response.headers.get('content-type') ?? '', bytes: new Uint8Array() };
    }
    if (!response.body) return { status: response.status, url: current.href, contentType: response.headers.get('content-type') ?? '', bytes: new Uint8Array() };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        byteLength += chunk.value.byteLength;
        if (byteLength > maxBytes) throw new Error(`Discovery response exceeds ${Math.round(maxBytes / 1024 / 1024)} MiB.`);
        chunks.push(chunk.value);
      }
    } catch (error) {
      await reader.cancel();
      throw error;
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { status: response.status, url: current.href, contentType: response.headers.get('content-type') ?? '', bytes };
  }
  throw new Error('Too many redirects during official source discovery.');
}

function asText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function sitemapLocations(xml: string): { nested: string[]; pages: string[] } {
  const $ = load(xml, { xmlMode: true });
  const nested = $('sitemap > loc').toArray().map((element) => $(element).text().trim()).filter(Boolean);
  const pages = $('url > loc').toArray().map((element) => $(element).text().trim()).filter(Boolean);
  return { nested, pages };
}

function pathScore(url: string): number {
  const lower = url.toLowerCase();
  return (lower.match(/weld|welding|filler|parameter|application|technical|manual|wire|electrode|mig|tig|stick|flux|data/g) ?? []).length;
}

function sourceTypeFor(url: string, html = '', title = ''): DiscoveredSourceType {
  if (/\.pdf(?:$|[?#])/i.test(url) || /application\/pdf/i.test(html)) return 'pdf-table';
  if (/calculator/i.test(`${url} ${title}`)) return 'interactive-calculator';
  if (/technical|datasheet|data-sheet|specification/i.test(url)) return 'technical-data-sheet';
  if (/resource|guide|manual|application|weld-setting/i.test(url)) return 'resource-page';
  if (/product|filler|wire|electrode|consumable/i.test(url)) return 'manufacturer-product-page';
  if (/guide|how-to/i.test(url)) return 'welding-guide';
  return 'resource-page';
}

function detectFields(labelSource: string): string[] {
  return FIELD_LABELS.flatMap(([label, expression]) => expression.test(labelSource) ? [label] : []);
}

function unitsExplicit(text: string, fields: readonly string[]): boolean {
  const unitsByField: Readonly<Record<string, RegExp>> = {
    voltage: /\bvoltage\b.{0,24}\b(?:v|volts?)\b/i,
    'amperage/current': /\b(?:amperage|current)\b.{0,24}\b(?:a|amps?)\b/i,
    'wire feed speed': /\b(?:wire[ -]?feed(?:\s+speed)?|wfs)\b.{0,28}\b(?:ipm|m\/min|mm\/min|in\/min)\b/i,
    'gas flow': /\bgas\s+flow\b.{0,24}\b(?:cfh|l\/min)\b/i,
    'wire diameter': /\bwire\s+diameter\b.{0,24}\b(?:mm|in(?:ch(?:es)?)?)\b/i,
    'electrode diameter': /\belectrode\s+diameter\b.{0,24}\b(?:mm|in(?:ch(?:es)?)?)\b/i,
  };
  const measuredFields = fields.filter((field) => Object.hasOwn(unitsByField, field));
  return measuredFields.length > 0 && measuredFields.every((field) => unitsByField[field]!.test(text));
}

function deriveSuitability(text: string, fields: readonly string[], explicitUnits: boolean, structured: boolean): CalculatorSuitability {
  if (/machine\s+(?:control\s+)?settings|machine-specific|machine specific/i.test(text) ||
    /\bsetting\b/i.test(text) && /\b[A-D]-\d(?:\.\d+)?\b/i.test(text)) return 'machine-specific';
  if (/machine capabilities|machine operating|operating ranges|fcaw and mig process parameters/i.test(text)) return 'machine-capability';
  if (!structured) return 'unsupported';
  const hasConsumable = fields.includes('wire diameter') || fields.includes('electrode diameter');
  const hasSettings = [...SETTING_FIELDS].filter((field) => fields.includes(field)).length >= 2;
  const hasMaterial = fields.includes('material');
  const hasThickness = fields.includes('material thickness');
  const hasProcess = detectedProcesses(text).length === 1;
  if (hasMaterial && hasThickness && hasConsumable && hasSettings && hasProcess && explicitUnits) return 'generic-recommendation';
  if (hasConsumable && hasSettings) return 'consumable-reference';
  return 'unsupported';
}

function classifyReadability(input: {
  evidence: DiscoveryEvidence; fields: readonly string[]; unitsExplicit: boolean; hasRows: boolean;
}): { rating: ReadabilityRating; reason: string } {
  const { evidence, fields } = input;
  if (evidence.blockedBy403) return { rating: 'unsupported', reason: 'Official server returned HTTP 403; discovery stopped without bypassing access controls.' };
  if (evidence.interactiveOnly && !evidence.structuredHtmlTable && !evidence.embeddedJson && !evidence.pdfMachineText) {
    return { rating: 'unsupported', reason: 'Interactive calculator exposes no supported public table or data structure; no form submission or private request was attempted.' };
  }
  if (evidence.ambiguousPdfTable) return { rating: 'manual-review', reason: 'PDF text is present, but table geometry/layout is ambiguous or reconstruction failed.' };
  const labeledSettings = [...SETTING_FIELDS].filter((field) => fields.includes(field)).length;
  const structured = evidence.structuredHtmlTable || evidence.embeddedJson || evidence.pdfMachineText;
  if (structured && input.hasRows && labeledSettings >= 2 && input.unitsExplicit) {
    return { rating: labeledSettings >= 3 ? 'excellent' : 'good', reason: 'Structured source rows contain multiple explicitly labeled setting fields with published units.' };
  }
  if (structured && fields.length > 0) return { rating: 'manual-review', reason: 'Structured content exists, but labeled settings, explicit units, or complete rows are insufficient for reliable extraction.' };
  return { rating: 'unsupported', reason: 'No machine-readable welding parameter table or structured source data was detected.' };
}

function emptyEvidence(overrides: Partial<DiscoveryEvidence> = {}): DiscoveryEvidence {
  return {
    structuredHtmlTable: false, embeddedJson: false, pdfMachineText: false, explicitParameterColumns: false,
    thicknessContext: false, materialContext: false, consumableContext: false, explicitUnits: false,
    blockedBy403: false, interactiveOnly: false, ambiguousPdfTable: false, ...overrides,
  };
}

export async function analyzeCandidate(source: RetrievedSource, sourceId: string): Promise<DiscoveryCandidate> {
  const sourceHash = hashSource(source.bytes);
  const approved = approvedSourceUrl(source.url);
  let title = '';
  let labelSource = '';
  let fullText = '';
  let structuredHtmlTable = false;
  let embeddedJson = false;
  let pdfMachineText = false;
  let ambiguousPdfTable = false;
  let hasRows = false;
  let importerSupported = false;
  let explicitUnitSource = '';
  let sourceType: DiscoveredSourceType;

  if (source.mediaType === 'pdf') {
    sourceType = 'pdf-table';
    try {
      const extracted = await extractPdfText(source.bytes);
      title = extracted.title;
      fullText = extracted.pages.flatMap((page) => page.runs.map((run) => run.text)).join(' ');
      if (source.manufacturer === 'ESAB') {
        labelSource = fullText;
        explicitUnitSource = fullText;
        pdfMachineText = extracted.pages.some((page) => page.runs.length > 0);
        ambiguousPdfTable = true;
      } else {
        try {
          const parsed = parseLincolnPdfTables(extracted.pages, title, {
            ...(source.manufacturer === 'Miller' ? { tableTitles: MILLER_TABLE_TITLES } : {}),
            manufacturer: source.manufacturer,
          });
          const headings = parsed.diagnostics.flatMap((diagnostic) => diagnostic.detectedTableHeadings);
          labelSource = `${headings.join(' ')} ${parsed.rows.flatMap((row) => [...row.headers, ...Object.keys(row.context)]).join(' ')}`;
          explicitUnitSource = parsed.rows.flatMap((row) => [...row.headers, ...row.physicalValues.map((value) => value.unit), ...row.cells]).join(' ');
          hasRows = parsed.rows.length > 0;
          pdfMachineText = hasRows;
          ambiguousPdfTable = parsed.failures.length > 0 || parsed.diagnostics.some((diagnostic) => diagnostic.manualReviewRequired);
          importerSupported = parsed.rows.length > 0 && source.manufacturer === 'Lincoln Electric' || parsed.rows.length > 0 && source.manufacturer === 'Miller';
        } catch (error) {
          if (error instanceof Error && /No supported|no published rows/i.test(error.message)) {
            labelSource = fullText;
            ambiguousPdfTable = /SUGGESTED SETTINGS FOR WELDING|APPLICATION CHART/i.test(fullText);
          } else throw error;
        }
      }
    } catch {
      ambiguousPdfTable = true;
    }
  } else {
    sourceType = sourceTypeFor(source.url, source.html, title);
    const $ = load(source.html);
    title = $('title').first().text().trim() || $('h1').first().text().trim();
    const headers: string[] = [];
    const captions: string[] = [];
    $('table').each((_, element) => {
      structuredHtmlTable = true;
      const table = $(element);
      captions.push(table.children('caption').text().trim(), table.attr('aria-label') ?? '');
      table.find('tr').first().children('th,td').each((__, cell) => { headers.push($(cell).text().trim()); });
      hasRows ||= table.find('tr').length > 1;
    });
    const scripts = $('script[type="application/json"],script[type="application/ld+json"]');
    scripts.each((_, element) => {
      try {
        const json: unknown = JSON.parse($(element).text());
        if (json && typeof json === 'object' && 'tables' in json && Array.isArray((json as { tables?: unknown }).tables)) embeddedJson = true;
      } catch { /* Malformed embedded JSON is not treated as machine-readable content. */ }
    });
    fullText = $('body').find('h1,h2,h3,h4,h5,h6,p,li,td,th,label').toArray()
      .map((element) => $(element).text().trim()).filter(Boolean).join(' ');
    labelSource = `${headers.join(' ')} ${captions.join(' ')} ${$('h1,h2,h3,h4,th,label').text()}`;
    explicitUnitSource = `${headers.join(' ')} ${captions.join(' ')}`;
    if (embeddedJson) {
      const jsonText = scripts.toArray().map((element) => $(element).text()).join(' ');
      labelSource += ` ${jsonText}`;
      explicitUnitSource += ` ${jsonText}`;
      hasRows ||= /"rows"\s*:\s*\[\s*\[/.test(jsonText);
    }
    if (source.manufacturer === 'ESAB') {
      try { parseEsabParameters(source.html); importerSupported = true; } catch { importerSupported = false; }
    } else if (source.manufacturer === 'Miller') {
      try { importerSupported = (await parseMillerSource(source)).rows.length > 0; } catch { importerSupported = false; }
    }
  }

  const detectedFields = detectFields(labelSource);
  const processes = detectedProcesses(`${title} ${labelSource} ${fullText}`);
  const units = unitsExplicit(explicitUnitSource, detectedFields);
  const evidence = emptyEvidence({
    structuredHtmlTable, embeddedJson, pdfMachineText,
    explicitParameterColumns: [...SETTING_FIELDS].some((field) => detectedFields.includes(field)),
    thicknessContext: detectedFields.includes('material thickness'), materialContext: detectedFields.includes('material'),
    consumableContext: detectedFields.includes('wire diameter') || detectedFields.includes('electrode diameter'),
    explicitUnits: units, ambiguousPdfTable, interactiveOnly: sourceType === 'interactive-calculator',
  });
  const readability = classifyReadability({ evidence, fields: detectedFields, unitsExplicit: units, hasRows });
  const hasStructuredContent = structuredHtmlTable || embeddedJson || pdfMachineText;
  const suitability = deriveSuitability(`${title} ${labelSource} ${fullText}`, detectedFields, units, hasStructuredContent);
  const fieldsMissing = EXPECTED_FIELDS.filter((field) => field === 'wire diameter/electrode diameter'
    ? !detectedFields.includes('wire diameter') && !detectedFields.includes('electrode diameter')
    : !detectedFields.includes(field));
  return {
    manufacturer: source.manufacturer, sourceId, sourceUrl: approved.url.href,
    title: title || '(document title unavailable)', process: processes.length === 1 ? processes[0]! : null,
    ...(processes.length ? { processes } : {}), sourceType,
    readability: readability.rating, fieldsDetected: detectedFields, fieldsMissing,
    likelyAdapter: source.manufacturer === 'ESAB' ? 'esab' : source.manufacturer === 'Lincoln Electric' ? 'lincoln-pdf' : 'miller',
    suitability, reason: readability.reason, evidence, sourceHash, importerSupported,
  };
}

function candidateUrlsFromSitemaps(source: Manufacturer, rootUrl: string, policy: RobotsPolicy, sitemaps: readonly string[], request: typeof fetch,
  wait: (milliseconds: number) => Promise<void>, nextAllowedAt: Map<string, number>, warnings: string[]): Promise<string[]> {
  return (async () => {
    const sitemapUrls = [...new Set([...policy.sitemapUrls, ...sitemaps])]
      .sort((left, right) => sitemapPriority(right) - sitemapPriority(left))
      .slice(0, MAX_SITEMAPS_PER_HOST);
    const queued = [...new Set(sitemapUrls)];
    const discovered: string[] = [];
    const sitemapPolicies = new Map<string, RobotsPolicy>([[new URL(rootUrl).hostname, policy]]);
    let fetched = 0;
    while (queued.length && fetched < MAX_SITEMAPS_PER_HOST && discovered.length < MAX_DISCOVERED_URLS) {
      const sitemapUrl = queued.shift()!;
      let approved: ReturnType<typeof approvedSourceUrl>;
      try { approved = approvedSourceUrl(sitemapUrl); }
      catch { continue; }
      if (approved.source.manufacturer !== source) continue;
      let sitemapPolicy = sitemapPolicies.get(approved.url.hostname);
      if (!sitemapPolicy) {
        try {
          const robots = await readResource(new URL('/robots.txt', approved.url).href, source, request, wait, nextAllowedAt, 0);
          sitemapPolicy = robots.status === 404 ? parseRobots('')
            : robots.status >= 200 && robots.status < 300 ? parseRobots(asText(robots.bytes))
              : { ...parseRobots('User-agent: *\nDisallow: /'), accessible: false };
        } catch { sitemapPolicy = { ...parseRobots('User-agent: *\nDisallow: /'), accessible: false }; }
        sitemapPolicies.set(approved.url.hostname, sitemapPolicy);
      }
      if (!sitemapPolicy.accessible || !sitemapPolicy.allows(approved.url.pathname)) continue;
      try {
        const response = await readResource(approved.url.href, source, request, wait, nextAllowedAt, sitemapPolicy.crawlDelayMs, MAX_SITEMAP_BYTES);
        fetched += 1;
        if (response.status === 403) { warnings.push(`${response.url}: HTTP 403; no access bypass attempted.`); continue; }
        if (response.status < 200 || response.status >= 300) { warnings.push(`${response.url}: sitemap returned HTTP ${response.status}.`); continue; }
        const xml = asText(response.bytes);
        const entries = sitemapLocations(xml);
        queued.push(...entries.nested.filter((url) => !queued.includes(url))
          .sort((left, right) => sitemapPriority(right) - sitemapPriority(left))
          .slice(0, MAX_SITEMAPS_PER_HOST - fetched));
        for (const candidateUrl of entries.pages) {
          try {
            const candidate = approvedSourceUrl(candidateUrl);
            if (candidate.source.manufacturer !== source || EXCLUDED_PATH.test(candidate.url.pathname) || !CANDIDATE_PATH.test(candidate.url.pathname)) continue;
            discovered.push(candidate.url.href);
            if (discovered.length >= MAX_DISCOVERED_URLS) break;
          } catch { /* Non-approved or malformed sitemap entries are discarded. */ }
        }
      } catch (error) {
        warnings.push(`${sitemapUrl}: ${error instanceof Error ? error.message : 'sitemap fetch failed'}`);
      }
    }
    return [...new Set(discovered)];
  })();
}

function sourceFromResource(manufacturer: Manufacturer, result: ResourceResult): RetrievedSource {
  const isPdf = /^application\/pdf(?:;|$)/i.test(result.contentType) || /\.pdf(?:$|[?#])/i.test(result.url);
  return {
    url: result.url, manufacturer, retrievedAt: new Date().toISOString(), bytes: result.bytes,
    html: isPdf ? '' : asText(result.bytes), mediaType: isPdf ? 'pdf' : 'html',
  };
}

function sitemapPriority(input: string): number {
  const path = new URL(input).pathname.toLowerCase();
  if (/(?:^|\/)(?:us|en-us)(?:\/|$)|nam_en/.test(path)) return 20;
  if (/(?:^|\/)(?:en|eng)(?:\/|$)|eur_en/.test(path)) return 10;
  return 0;
}

function manufacturerFromFilter(value: string | undefined): Manufacturer | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower === 'esab') return 'ESAB';
  if (lower === 'lincoln' || lower === 'lincoln-electric') return 'Lincoln Electric';
  if (lower === 'miller') return 'Miller';
  throw new Error(`Unknown manufacturer: ${value}. Choose esab, lincoln, or miller.`);
}

export function emptyDiscoveryIndex(): DiscoveryIndex {
  return { format: 'weldcalc-source-discovery-index', version: 1, sources: [] };
}

export function parseDiscoveryIndex(text: string | undefined): DiscoveryIndex {
  if (!text) return emptyDiscoveryIndex();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('Discovery index is malformed; it will not be overwritten.'); }
  if (!parsed || typeof parsed !== 'object' || !('format' in parsed) || (parsed as { format: unknown }).format !== 'weldcalc-source-discovery-index' ||
    !('version' in parsed) || (parsed as { version: unknown }).version !== 1 || !('sources' in parsed) || !Array.isArray((parsed as { sources: unknown }).sources)) {
    throw new Error('Discovery index has an unsupported shape; it will not be overwritten.');
  }
  const sources = (parsed as { sources: unknown[] }).sources;
  const valid = sources.every((value) => {
    if (!value || typeof value !== 'object') return false;
    const entry = value as Record<string, unknown>;
    if (typeof entry.url !== 'string' || typeof entry.sourceId !== 'string' || typeof entry.manufacturer !== 'string' ||
      typeof entry.discoveredAt !== 'string' || !Number.isFinite(Date.parse(entry.discoveredAt)) ||
      typeof entry.lastCheckedAt !== 'string' || !Number.isFinite(Date.parse(entry.lastCheckedAt)) ||
      !['generic-recommendation', 'machine-specific', 'machine-capability', 'consumable-reference', 'unsupported'].includes(String(entry.suitability)) ||
      (entry.sourceHash !== undefined && (typeof entry.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sourceHash)))) return false;
    try { return approvedSourceUrl(entry.url).source.manufacturer === entry.manufacturer; }
    catch { return false; }
  });
  if (!valid) throw new Error('Discovery index contains invalid or unapproved entries; it will not be overwritten.');
  return parsed as DiscoveryIndex;
}

export async function discoverOfficialSources(
  options: { manufacturer?: string; process?: WeldingProcess } = {},
  environment: { request?: typeof fetch; now?: () => string; wait?: (milliseconds: number) => Promise<void>; index?: DiscoveryIndex } = {},
): Promise<DiscoveryRunResult> {
  const manufacturerFilter = manufacturerFromFilter(options.manufacturer);
  const manufacturers = (['ESAB', 'Lincoln Electric', 'Miller'] as const).filter((manufacturer) => !manufacturerFilter || manufacturerFilter === manufacturer);
  const request = environment.request ?? fetch;
  const wait = environment.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const oldIndex = environment.index ?? emptyDiscoveryIndex();
  const previousByUrl = new Map(oldIndex.sources.map((entry) => [entry.url, entry]));
  const indexByUrl = new Map(previousByUrl);
  const candidates: DiscoveryCandidate[] = [];
  const importedSources: RetrievedSource[] = [];
  const warnings: string[] = [];
  const nextAllowedAt = new Map<string, number>();
  const now = environment.now ?? (() => new Date().toISOString());

  for (const manufacturer of manufacturers) {
    const rootUrl = MANUFACTURER_ROOTS[manufacturer];
    let rootPolicy: RobotsPolicy;
    try {
      const root = approvedSourceUrl(rootUrl);
      const robotsResult = await readResource(new URL('/robots.txt', root.url).href, manufacturer, request, wait, nextAllowedAt, 0);
      if (robotsResult.status === 403) {
        warnings.push(`${manufacturer}: robots.txt returned HTTP 403; no sitemap or source pages fetched.`);
        rootPolicy = parseRobots('User-agent: *\nDisallow: /');
        rootPolicy = { ...rootPolicy, accessible: false };
      } else if (robotsResult.status === 404) rootPolicy = parseRobots('');
      else if (robotsResult.status < 200 || robotsResult.status >= 300) {
        warnings.push(`${manufacturer}: robots.txt returned HTTP ${robotsResult.status}; discovery failed closed.`);
        rootPolicy = { ...parseRobots('User-agent: *\nDisallow: /'), accessible: false };
      } else rootPolicy = parseRobots(asText(robotsResult.bytes));
    } catch (error) {
      warnings.push(`${manufacturer}: robots.txt unavailable; discovery failed closed: ${error instanceof Error ? error.message : 'network error'}`);
      rootPolicy = { ...parseRobots('User-agent: *\nDisallow: /'), accessible: false };
    }

    const seeds = OFFICIAL_SCAN_SOURCES.filter((source) => source.manufacturer === manufacturer);
    const sitemapUrls = rootPolicy.sitemapUrls.length ? rootPolicy.sitemapUrls : [new URL('/sitemap.xml', rootUrl).href];
    const sitemapUrlsFound = rootPolicy.accessible
      ? await candidateUrlsFromSitemaps(manufacturer, rootUrl, rootPolicy, sitemapUrls, request, wait, nextAllowedAt, warnings)
      : [];
    const urls = new Map<string, { id: string; score: number }>();
    for (const seed of seeds) {
      const seedProcesses = seed.process ? [seed.process] : seed.processes ?? [];
      if (options.process && seedProcesses.length && !seedProcesses.includes(options.process)) continue;
      urls.set(approvedSourceUrl(seed.url).url.href, { id: seed.id, score: 100 });
    }
    for (const url of sitemapUrlsFound) {
      const approved = approvedSourceUrl(url);
      const policy = approved.url.hostname === new URL(rootUrl).hostname ? rootPolicy : undefined;
      if (policy && !policy.allows(approved.url.pathname)) continue;
      const processHints = detectedProcesses(approved.url.href);
      if (options.process && processHints.length && !processHints.includes(options.process)) continue;
      urls.set(approved.url.href, { id: sourceIdFor(manufacturer, approved.url.href), score: pathScore(approved.url.href) });
    }
    const ranked = [...urls].sort((left, right) => right[1].score - left[1].score).slice(0, MAX_CANDIDATES_PER_MANUFACTURER - 3);
    const pending = [...ranked];
    const queuedUrls = new Set(pending.map(([url]) => url));
    const policyByHost = new Map<string, RobotsPolicy>([[new URL(rootUrl).hostname, rootPolicy]]);
    let processed = 0;
    while (pending.length && processed < MAX_CANDIDATES_PER_MANUFACTURER) {
      const [url, identity] = pending.shift()!;
      processed += 1;
      let approved: ReturnType<typeof approvedSourceUrl>;
      try { approved = approvedSourceUrl(url); }
      catch { continue; }
      let policy = policyByHost.get(approved.url.hostname);
      if (!policy) {
        try {
          const response = await readResource(new URL('/robots.txt', approved.url).href, manufacturer, request, wait, nextAllowedAt, 0);
          policy = response.status === 404 ? parseRobots('')
            : response.status >= 200 && response.status < 300 ? parseRobots(asText(response.bytes))
              : { ...parseRobots('User-agent: *\nDisallow: /'), accessible: false };
        } catch { policy = { ...parseRobots('User-agent: *\nDisallow: /'), accessible: false }; }
        policyByHost.set(approved.url.hostname, policy);
      }
      const prior = previousByUrl.get(approved.url.href);
      let candidate: DiscoveryCandidate;
      let retrieved: RetrievedSource | undefined;
      if (!policy.accessible || !policy.allows(approved.url.pathname)) {
        candidate = {
          manufacturer, sourceId: identity.id, sourceUrl: approved.url.href, title: '(not fetched: disallowed by robots.txt)',
          process: null, sourceType: sourceTypeFor(approved.url.href), readability: 'unsupported',
          fieldsDetected: [], fieldsMissing: EXPECTED_FIELDS, likelyAdapter: manufacturer === 'ESAB' ? 'esab' : manufacturer === 'Lincoln Electric' ? 'lincoln-pdf' : 'miller',
          suitability: 'unsupported', reason: policy.accessible ? 'robots.txt disallows this source path; no request was made.' : 'robots.txt could not be read; discovery failed closed.',
          evidence: emptyEvidence(), importerSupported: false,
        };
      } else {
        try {
          const resource = await readResource(approved.url.href, manufacturer, request, wait, nextAllowedAt, policy.crawlDelayMs);
          if (resource.status === 403) {
            candidate = {
              manufacturer, sourceId: identity.id, sourceUrl: resource.url, title: '(blocked by HTTP 403)',
              process: null, sourceType: sourceTypeFor(approved.url.href), readability: 'unsupported',
              fieldsDetected: [], fieldsMissing: EXPECTED_FIELDS, likelyAdapter: manufacturer === 'ESAB' ? 'esab' : manufacturer === 'Lincoln Electric' ? 'lincoln-pdf' : 'miller',
              suitability: 'unsupported', reason: 'Official server returned HTTP 403; no access bypass attempted.',
              evidence: emptyEvidence({ blockedBy403: true }), importerSupported: false,
            };
          } else if (resource.status < 200 || resource.status >= 300) {
            candidate = {
              manufacturer, sourceId: identity.id, sourceUrl: resource.url, title: `(HTTP ${resource.status})`,
              process: null, sourceType: sourceTypeFor(approved.url.href), readability: 'unsupported',
              fieldsDetected: [], fieldsMissing: EXPECTED_FIELDS, likelyAdapter: manufacturer === 'ESAB' ? 'esab' : manufacturer === 'Lincoln Electric' ? 'lincoln-pdf' : 'miller',
              suitability: 'unsupported', reason: `Official source returned HTTP ${resource.status}.`, evidence: emptyEvidence(), importerSupported: false,
            };
          } else {
            retrieved = sourceFromResource(manufacturer, resource);
            candidate = await analyzeCandidate(retrieved, identity.id);
          }
        } catch (error) {
          candidate = {
            manufacturer, sourceId: identity.id, sourceUrl: approved.url.href, title: '(source could not be analyzed)',
            process: null, sourceType: sourceTypeFor(approved.url.href), readability: 'manual-review',
            fieldsDetected: [], fieldsMissing: EXPECTED_FIELDS, likelyAdapter: manufacturer === 'ESAB' ? 'esab' : manufacturer === 'Lincoln Electric' ? 'lincoln-pdf' : 'miller',
            suitability: 'unsupported', reason: error instanceof Error ? error.message : 'Source analysis failed.',
            evidence: emptyEvidence({ ambiguousPdfTable: /pdf|table|layout/i.test(error instanceof Error ? error.message : '') }), importerSupported: false,
          };
        }
      }
      if (options.process && candidate.process !== options.process && !candidate.processes?.includes(options.process)) continue;
      candidates.push(candidate);
      indexByUrl.set(candidate.sourceUrl, {
        url: candidate.sourceUrl, sourceId: candidate.sourceId, manufacturer,
        discoveredAt: prior?.discoveredAt ?? now(), lastCheckedAt: now(),
        ...(candidate.sourceHash ? { sourceHash: candidate.sourceHash } : prior?.sourceHash ? { sourceHash: prior.sourceHash } : {}),
        suitability: candidate.suitability,
      });
      if (retrieved) {
        importedSources.push(retrieved);
        if (retrieved.mediaType === 'html' && processed < MAX_CANDIDATES_PER_MANUFACTURER) {
          const $ = load(retrieved.html);
          $('a[href]').each((_, element) => {
            const anchor = $(element);
            const href = anchor.attr('href');
            const linkText = `${anchor.text()} ${anchor.attr('title') ?? ''} ${href ?? ''}`;
            if (!href || !(/\.pdf(?:$|[?#])/i.test(href) || /pdf|manual|technical data|data sheet/i.test(linkText))) return;
            try {
              const linked = approvedSourceUrl(new URL(href, retrieved.url).href);
              if (linked.source.manufacturer !== manufacturer || EXCLUDED_PATH.test(linked.url.pathname) || queuedUrls.has(linked.url.href)) return;
              queuedUrls.add(linked.url.href);
              pending.push([linked.url.href, { id: sourceIdFor(manufacturer, linked.url.href), score: pathScore(linked.url.href) + 10 }]);
            } catch { /* External or malformed document links are not candidates. */ }
          });
        }
      }
    }
  }
  return {
    candidates, index: { format: 'weldcalc-source-discovery-index', version: 1, sources: [...indexByUrl.values()] },
    importedSources, warnings,
  };
}

export function createDiscoveryIndexEntry(candidate: DiscoveryCandidate, previous: DiscoveryIndexEntry | undefined, timestamp: string): DiscoveryIndexEntry {
  return {
    url: candidate.sourceUrl, sourceId: candidate.sourceId, manufacturer: candidate.manufacturer,
    discoveredAt: previous?.discoveredAt ?? timestamp, lastCheckedAt: timestamp,
    ...(candidate.sourceHash ? { sourceHash: candidate.sourceHash } : previous?.sourceHash ? { sourceHash: previous.sourceHash } : {}),
    suitability: candidate.suitability,
  };
}