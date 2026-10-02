import { load } from 'cheerio';
import { parse } from 'parse5';
import type { ExtractedParameter, ExtractedRow, ParameterKind, ParsedSource } from '../types';

export const ESAB_PARSER_NAME = 'esab-recommended-welding-parameters-html';
export const ESAB_PARSER_VERSION = '1.0.0';
const TABLE_LABEL = 'recommended welding parameters';
const KINDS: Readonly<Record<string, ParameterKind>> = {
  'wire diameter': 'wireDiameter',
  diameter: 'wireDiameter',
  amperage: 'amperage',
  current: 'amperage',
  'welding current': 'amperage',
  voltage: 'voltage',
  'arc voltage': 'voltage',
  'wire feed speed': 'wireFeed',
  'wire-feed speed': 'wireFeed',
};

function labelText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function column(header: string): { kind: ParameterKind | undefined; unit: string | undefined } {
  const match = /^(.*?)\s*(?:\(([^()]*)\)|\[([^[\]]*)\])\s*$/.exec(header);
  return {
    kind: KINDS[labelText(match?.[1] ?? header)],
    unit: (match?.[2] ?? match?.[3])?.trim() || undefined,
  };
}

function parameter(kind: ParameterKind, header: string, text: string, headerUnit: string | undefined): ExtractedParameter {
  const numeric = '(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
  const pattern = new RegExp(`^(${numeric})(?:\\s*(?:-|\u2013|\u2014|to)\\s*(${numeric}))?(?:\\s+(.+))?$`, 'i');
  const match = pattern.exec(text);
  const cellUnit = match?.[3]?.trim();
  const conflict = cellUnit && headerUnit && cellUnit !== headerUnit;
  return {
    kind,
    header,
    text,
    unit: conflict ? undefined : cellUnit ?? headerUnit,
    min: conflict ? undefined : match?.[1],
    max: conflict ? undefined : match?.[2] ?? match?.[1],
  };
}

/** Reads published table text only. No absent units, rows or welding values are inferred. */
export function parseEsabParameters(html: string): ParsedSource {
  const syntaxErrors: string[] = [];
  parse(html, { onParseError: (error) => {
    if (error.code !== 'missing-doctype') syntaxErrors.push(error.code);
  } });
  if (syntaxErrors.length) throw new Error(`Malformed source HTML: ${[...new Set(syntaxErrors)].join(', ')}`);
  const $ = load(html);
  const title = $('title').first().text().trim() || $('h1').first().text().trim();
  if (!title) throw new Error('Source document title is missing.');
  const elements = $('*').toArray();
  const rows: ExtractedRow[] = [];
  let matchedTables = 0;

  $('table').each((tableIndex, tableElement) => {
    const table = $(tableElement);
    const elementIndex = elements.indexOf(tableElement);
    const headingElement = elements.slice(0, elementIndex).reverse().find((element) => 'tagName' in element && /^h[1-6]$/.test(element.tagName));
    const heading = headingElement ? $(headingElement) : null;
    const accessibleLabel = (table.attr('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)
      .map((id) => $('[id]').filter((_, element) => $(element).attr('id') === id).text()).join(' ');
    const labels = [table.children('caption').text(), table.attr('aria-label') ?? '', accessibleLabel, heading?.text() ?? ''];
    if (!labels.some((label) => labelText(label) === TABLE_LABEL)) return;
    matchedTables += 1;
    const tableIdentifier = table.attr('id') || heading?.attr('id') || `document-table-${tableIndex + 1}`;
    const tableRows = table.find('tr').filter((_, element) => $(element).closest('table')[0] === tableElement).toArray();
    const headerElement = tableRows.find((element) => $(element).children('th,td').length > 0);
    if (!headerElement) throw new Error(`Labeled table ${tableIdentifier} has no header row.`);
    const headers = $(headerElement).children('th,td').toArray().map((element) => $(element).text().trim());
    const columns = headers.map(column);
    const kinds = columns.flatMap((value) => value.kind ? [value.kind] : []);
    const tableErrors: string[] = [];
    for (const kind of ['wireDiameter', 'amperage', 'voltage', 'wireFeed'] as const) {
      if (!kinds.includes(kind)) tableErrors.push(`No explicitly labeled ${kind} column was published in this table.`);
      if (kinds.filter((value) => value === kind).length > 1) tableErrors.push(`Multiple ${kind} columns require a reviewed parser adapter.`);
    }
    if (table.find('[rowspan],[colspan]').length) tableErrors.push('Spanning cells require a reviewed parser adapter; automatic alignment is disabled.');
    const headerIndex = tableRows.indexOf(headerElement);
    tableRows.slice(headerIndex + 1).forEach((element, rowIndex) => {
      const cells = $(element).children('td,th').toArray().map((cell) => $(cell).text().trim());
      if (!cells.length) return;
      const errors = [...tableErrors];
      const parameters: ExtractedParameter[] = [];
      if (cells.length !== headers.length) errors.push(`Source row has ${cells.length} cells but ${headers.length} headers; exact cells retained.`);
      const ambiguous = errors.some((error) => /Multiple|Spanning|cells but/.test(error));
      if (!ambiguous) columns.forEach((definition, index) => {
        const text = cells[index];
        const header = headers[index];
        if (!definition.kind || !text || !header) return;
        const extracted = parameter(definition.kind, header, text, definition.unit);
        parameters.push(extracted);
        if (extracted.min === undefined) errors.push(`${header}: cell is not an unambiguous decimal value/range; manual review required.`);
        if (extracted.unit === undefined) errors.push(`${header}: unit is missing or conflicting; no unit was assumed.`);
      });
      rows.push({ tableIdentifier, rowNumber: rowIndex + 1, headers, cells, parameters, errors });
    });
  });
  if (!matchedTables) throw new Error('No explicitly labeled Recommended Welding Parameters HTML table found. Dynamic pages and PDFs need a separate reviewed adapter.');
  if (!rows.length) throw new Error('Recommended Welding Parameters table contains no published data rows.');
  return { title, parserName: ESAB_PARSER_NAME, parserVersion: ESAB_PARSER_VERSION, rows };
}