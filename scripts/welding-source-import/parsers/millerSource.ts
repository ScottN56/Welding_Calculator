import { load } from 'cheerio';
import { parse } from 'parse5';
import { isObject } from '../../../src/features/welding/data/staging/importExport/types';
import type { SourceClassification, ManufacturerMachineSetting } from '../../../src/features/welding/data/staging/types';
import { extractPdfText, headerColumn, parseLincolnPdfTables, physicalValue } from './lincolnPdfTables';
import type { RetrievedSource } from '../types';

export const MILLER_TABLE_TITLES = /^(?:Recommended Welding Settings|Recommended Welding Parameters|Suggested Welding Settings|FCAW And MIG Process Parameters|Machine Capabilities|Machine Operating Parameters|Operating Ranges|Machine Control Settings|Reference Guidance|Welding Guidance|Welding Parameters)(?:\s|$)/i;

export function classifyMillerTable(title: string): SourceClassification {
  if (/^(?:Recommended Welding Settings|Recommended Welding Parameters|Suggested Welding Settings)(?:\s|$)/i.test(title)) return 'recommended-setting';
  if (/^(?:FCAW And MIG Process Parameters|Machine Capabilities|Machine Operating Parameters|Operating Ranges)(?:\s|$)/i.test(title)) return 'machine-capability';
  if (/^Machine Control Settings(?:\s|$)/i.test(title)) return 'machine-specific-setting';
  if (/^(?:Reference Guidance|Welding Guidance)(?:\s|$)/i.test(title)) return 'reference-guidance';
  return 'unsupported';
}

export interface MillerField {
  readonly key: string;
  readonly header: string;
  readonly text: string;
  readonly unit?: string;
}

export interface MillerRow {
  readonly tableTitle: string;
  readonly tableIdentifier: string;
  readonly pageNumber?: number;
  readonly classification: SourceClassification;
  readonly fields: readonly MillerField[];
  readonly original: unknown;
  readonly errors: readonly string[];
  readonly manualNumber?: string;
  readonly edition?: string;
  readonly manufacturerMachineSetting?: ManufacturerMachineSetting;
}

export interface MillerParsedSource {
  readonly title: string;
  readonly rows: readonly MillerRow[];
  readonly calculator: boolean;
  readonly publicDataDetected: boolean;
}

function readCells(title: string, identifier: string, headers: readonly string[], cells: readonly string[], original: unknown): MillerRow {
  const errors: string[] = [];
  const fields: MillerField[] = [];
  let classification = classifyMillerTable(title);
  let manufacturerMachineSetting: ManufacturerMachineSetting | undefined;
  if (headers.length !== cells.length) errors.push('Header/cell counts differ; cells are retained, not realigned.');
  const kinds = headers.map((header) => headerColumn(header)?.kind);
  if (kinds.filter(Boolean).length !== new Set(kinds.filter(Boolean)).size) errors.push('Ambiguous duplicate column meanings; automatic alignment disabled.');
  if (errors.length === 0) headers.forEach((header, index) => {
    const definition = headerColumn(header);
    const text = cells[index]!;
    if (!definition) return;
    if (!text.trim()) { errors.push(`Blank published cell ${header}; no value supplied.`); return; }
    fields.push({ key: definition.kind, header, text, ...(definition.unit ? { unit: definition.unit } : {}) });
    if (definition.kind === 'setting' || /^[A-Z]-\d+(?:\.\d+)?$/i.test(text)) {
      manufacturerMachineSetting = { value: text };
      classification = 'machine-specific-setting';
    }
    if (['voltage', 'amperage', 'wireFeed', 'gasFlow'].includes(definition.kind) &&
      !physicalValue(definition.kind as 'voltage' | 'amperage' | 'wireFeed' | 'gasFlow', text, header, definition.unit)) {
      errors.push(`Published ${header} cannot be safely represented as a direct physical parameter; literal cell retained.`);
    }
  });
  if (errors.length) classification = 'unsupported';
  return { tableTitle: title, tableIdentifier: identifier, classification, fields, original, errors,
    ...(manufacturerMachineSetting ? { manufacturerMachineSetting } : {}) };
}

/** Reads only public HTML/JSON values and positioned PDF text; never executes scripts or probes endpoints. */
export async function parseMillerSource(source: RetrievedSource): Promise<MillerParsedSource> {
  if (source.mediaType === 'json') {
    let payload: unknown;
    try { payload = JSON.parse(source.html); }
    catch { throw new Error('Malformed Miller JSON source; literal JSON is required, scripts are never evaluated.'); }
    if (!isObject(payload) || typeof payload.title !== 'string' || !payload.title.trim() || !Array.isArray(payload.tables)) {
      throw new Error('Miller JSON requires a document title and explicit tables array.');
    }
    const embeddedJson = JSON.stringify(payload).replace(/</g, '\\u003c');
    const safeTitle = payload.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return parseMillerSource({
      ...source, mediaType: 'html',
      html: `<html><head><title>${safeTitle}</title></head><body><script type="application/json">${embeddedJson}</script></body></html>`,
    });
  }
  if (source.mediaType === 'pdf') {
    const { title, pages } = await extractPdfText(source.bytes);
    let parsed;
    try { parsed = parseLincolnPdfTables(pages, title, { tableTitles: MILLER_TABLE_TITLES, manufacturer: 'Miller' }); }
    catch (error) {
      if (error instanceof Error && error.message.startsWith('No supported Miller')) return { title, rows: [], calculator: false, publicDataDetected: false };
      throw error;
    }
    const rows: MillerRow[] = parsed.rows.map((row) => {
      const fields: MillerField[] = Object.entries(row.context).map(([key, text]) => ({ key, header: key, text }));
      row.headers.forEach((header, index) => {
        const definition = headerColumn(header);
        if (!definition || !row.cells[index]) return;
        const prior = fields.findIndex((field) => field.key === definition.kind);
        const field = { key: definition.kind, header, text: row.cells[index]!, ...(definition.unit ? { unit: definition.unit } : {}) };
        if (prior >= 0) fields[prior] = field;
        else fields.push(field);
      });
      return {
        tableTitle: row.tableTitle, tableIdentifier: `${row.pageNumber}:${row.tableTitle}`, pageNumber: row.pageNumber,
        classification: row.manufacturerMachineSetting ? 'machine-specific-setting' : row.errors.length ? 'unsupported' : classifyMillerTable(row.tableTitle),
        fields, original: row, errors: row.errors,
        ...(row.context.manualNumber ? { manualNumber: row.context.manualNumber } : {}),
        ...(row.context.edition ? { edition: row.context.edition } : {}),
        ...(row.manufacturerMachineSetting ? { manufacturerMachineSetting: row.manufacturerMachineSetting } : {}),
      };
    });
    for (const failure of parsed.failures) rows.push({
      tableTitle: failure.tableTitle, tableIdentifier: `${failure.pageNumber}:${failure.tableTitle}`, pageNumber: failure.pageNumber,
      classification: 'unsupported', fields: [], original: failure, errors: [failure.message],
    });
    return { title, rows, calculator: false, publicDataDetected: rows.length > 0 };
  }

  const syntaxErrors: string[] = [];
  parse(source.html, { onParseError: (error) => { if (error.code !== 'missing-doctype') syntaxErrors.push(error.code); } });
  if (syntaxErrors.length) throw new Error(`Malformed Miller HTML: ${[...new Set(syntaxErrors)].join(', ')}`);
  const $ = load(source.html);
  const title = $('title').first().text().trim() || $('h1').first().text().trim();
  if (!title) throw new Error('Miller page title is missing.');
  const calculator = /weld-setting-calculators|welding-calculator/i.test(source.url) || /weld[- ]setting calculator|welding calculator/i.test(title);
  const rows: MillerRow[] = [];
  const elements = $('*').toArray();
  $('table').each((tableIndex, element) => {
    const table = $(element);
    const heading = elements.slice(0, elements.indexOf(element)).reverse().find((candidate) => 'tagName' in candidate && /^h[1-6]$/.test(candidate.tagName));
    const candidates = [table.children('caption').text().trim(), table.attr('aria-label') ?? '', heading ? $(heading).text().trim() : ''];
    const tableTitle = candidates.find((candidate) => MILLER_TABLE_TITLES.test(candidate));
    if (!tableTitle) return;
    const tableRows = table.find('tr').filter((_, candidate) => $(candidate).closest('table')[0] === element).toArray();
    const headers = tableRows[0] ? $(tableRows[0]).children('th,td').toArray().map((cell) => $(cell).text().trim()) : [];
    tableRows.slice(1).forEach((row) => {
      const cells = $(row).children('td,th').toArray().map((cell) => $(cell).text().trim());
      const parsed = readCells(tableTitle, table.attr('id') ?? `html-table-${tableIndex + 1}`, headers, cells, { headers, cells });
      rows.push(table.find('[rowspan],[colspan]').length ? { ...parsed, classification: 'unsupported', errors: [...parsed.errors, 'Spanning HTML cells require a reviewed adapter.'] } : parsed);
    });
  });

  $('script[type="application/json"],script[type="application/ld+json"]').each((scriptIndex, element) => {
    let data: unknown;
    try { data = JSON.parse($(element).text()); }
    catch { throw new Error('Malformed public JSON in Miller page; no script execution or guessed response is allowed.'); }
    if (!isObject(data) || !Array.isArray(data.tables)) return;
    for (const table of data.tables as unknown[]) {
      if (!isObject(table) || typeof table.title !== 'string' || !MILLER_TABLE_TITLES.test(table.title)) continue;
      if (!Array.isArray(table.headers) || !table.headers.every((header: unknown) => typeof header === 'string') || !Array.isArray(table.rows)) {
        rows.push({ tableTitle: table.title, tableIdentifier: `public-json-${scriptIndex + 1}`, classification: 'unsupported', fields: [], original: table, errors: ['Unsupported public table JSON structure; raw payload retained.'] });
        continue;
      }
      for (const cells of table.rows as unknown[]) {
        const identifier = `public-json-${scriptIndex + 1}:${table.title}`;
        if (!Array.isArray(cells) || !cells.every((cell: unknown) => typeof cell === 'string')) {
          rows.push({ tableTitle: table.title, tableIdentifier: identifier, classification: 'unsupported', fields: [], original: cells, errors: ['Published JSON cells must be literal strings with explicit source units; no schema or values guessed.'] });
          continue;
        }
        const parsed = readCells(table.title, identifier, table.headers as string[], cells, { headers: table.headers, cells });
        rows.push({ ...parsed,
          ...(typeof data.documentNumber === 'string' ? { manualNumber: data.documentNumber } : {}),
          ...(typeof data.edition === 'string' ? { edition: data.edition } : {}),
        });
      }
    }
  });
  if (rows.length > 2000) throw new Error('Miller source exceeds the supported row limit.');
  return { title, rows, calculator, publicDataDetected: rows.length > 0 };
}