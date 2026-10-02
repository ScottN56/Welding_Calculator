import type { ManufacturerMachineSetting } from '../../../src/features/welding/data/staging/types';

export interface PdfTextRun {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

export interface PdfTextPage {
  readonly pageNumber: number;
  readonly runs: readonly PdfTextRun[];
  readonly rotation?: number;
  readonly itemCount?: number;
  readonly extractionError?: string;
}

export interface PdfPageDiagnostic {
  readonly pageNumber: number;
  readonly pageRotation: number;
  readonly textItemCount: number;
  readonly detectedTableHeadings: readonly string[];
  readonly structuredExtractionSucceeded: boolean;
  readonly manualReviewRequired: boolean;
  readonly status: 'structured' | 'no-table-detected' | 'manual-review-required';
}

export interface LincolnPhysicalValue {
  readonly kind: 'voltage' | 'amperage' | 'wireFeed' | 'gasFlow';
  readonly text: string;
  readonly unit: string;
  readonly header: string;
}

export interface LincolnPublishedRow {
  readonly pageNumber: number;
  readonly tableTitle: string;
  readonly rowNumber: number;
  readonly category: 'direct-parameters' | 'machine-specific' | 'unsupported';
  readonly context: Readonly<Partial<Record<'process' | 'wire' | 'wireDiameter' | 'gas' | 'thickness' | 'polarity' | 'machine' | 'manualNumber' | 'edition' | 'transferMode' | 'material' | 'joint' | 'position', string>>>;
  readonly headers: readonly string[];
  readonly cells: readonly string[];
  readonly runs: readonly PdfTextRun[];
  readonly physicalValues: readonly LincolnPhysicalValue[];
  readonly manufacturerMachineSetting?: ManufacturerMachineSetting;
  readonly errors: readonly string[];
}

export interface LincolnPdfTableResult {
  readonly title: string;
  readonly manualNumber?: string;
  readonly rows: readonly LincolnPublishedRow[];
  readonly failures: readonly { pageNumber: number; tableTitle: string; message: string; runs: readonly PdfTextRun[] }[];
  readonly diagnostics: readonly PdfPageDiagnostic[];
}

const CONTEXT_LABELS = {
  process: 'process', 'welding wire': 'wire', wire: 'wire', 'wire diameter': 'wireDiameter',
  'shielding gas': 'gas', gas: 'gas', 'material thickness': 'thickness', thickness: 'thickness',
  'polarity/current': 'polarity', polarity: 'polarity', machine: 'machine', 'manual number': 'manualNumber',
  'document number': 'manualNumber', revision: 'edition', edition: 'edition', 'wire size': 'wireDiameter',
  'transfer type': 'transferMode', 'transfer mode': 'transferMode', material: 'material', 'material type': 'material',
  joint: 'joint', position: 'position',
} as const;
type ContextKey = (typeof CONTEXT_LABELS)[keyof typeof CONTEXT_LABELS];
type ColumnKind = ContextKey | 'setting' | LincolnPhysicalValue['kind'];

export function headerColumn(text: string): { kind: ColumnKind; unit?: string } | undefined {
  const match = /^(.*?)\s*(?:\(([^()]*)\)|\[([^[\]]*)\])\s*$/.exec(text);
  const label = (match?.[1] ?? text).trim().toLowerCase();
  const unit = match?.[2] ?? match?.[3];
  const physical: Record<string, LincolnPhysicalValue['kind']> = {
    voltage: 'voltage', volts: 'voltage', current: 'amperage', amperage: 'amperage', amps: 'amperage',
    'wire feed speed': 'wireFeed', 'wire-feed speed': 'wireFeed', ipm: 'wireFeed', 'in/min': 'wireFeed',
    'm/min': 'wireFeed', 'gas flow': 'gasFlow', cfh: 'gasFlow', 'l/min': 'gasFlow',
    wfs: 'wireFeed', 'wire feed speed range': 'wireFeed', 'voltage range': 'voltage',
  };
  const impliedByLiteralLabel = ['volts', 'amps', 'ipm', 'in/min', 'm/min', 'cfh', 'l/min'].includes(label);
  const kind = CONTEXT_LABELS[label as keyof typeof CONTEXT_LABELS] ?? physical[label] ??
    (['setting', 'published setting', 'machine setting', 'control setting'].includes(label) ? 'setting' : undefined);
  return kind ? { kind, ...(unit ? { unit } : impliedByLiteralLabel ? { unit: text } : {}) } : undefined;
}

export function physicalValue(kind: LincolnPhysicalValue['kind'], text: string, header: string, headerUnit?: string): LincolnPhysicalValue | undefined {
  const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:\s*(?:-|\u2013|\u2014|to)\s*(?:\d+(?:\.\d*)?|\.\d+))?(?:\s+(.+))?$/i.exec(text);
  const unit = match?.[1] ?? headerUnit;
  if (!match || !unit || (match[1] && headerUnit && match[1] !== headerUnit)) return undefined;
  const permitted: Record<LincolnPhysicalValue['kind'], readonly string[]> = {
    voltage: ['V', 'volts'], amperage: ['A', 'amps'], wireFeed: ['IPM', 'in/min', 'm/min', 'mm/min'], gasFlow: ['CFH', 'L/min'],
  };
  if (!permitted[kind].some((candidate) => candidate.toLowerCase() === unit.toLowerCase())) return undefined;
  return { kind, text, unit, header };
}

/** Supports single-line, left-aligned text tables only; ambiguous layouts are never realigned or converted. */
export function parseLincolnPdfTables(pages: readonly PdfTextPage[], title: string, options: { tableTitles?: RegExp; manufacturer?: string } = {}): LincolnPdfTableResult {
  const tableTitles = options.tableTitles ?? /^(?:SUGGESTED SETTINGS FOR WELDING|APPLICATION CHART)(?:\s|$)/i;
  if (!title.trim()) throw new Error('PDF document/manual title is missing; human source identification required.');
  const rows: LincolnPublishedRow[] = [];
  const failures: LincolnPdfTableResult['failures'][number][] = [];
  const manualNumbers = new Set<string>();
  let labeledTables = 0;
  const diagnostics: PdfPageDiagnostic[] = [];
  for (const page of pages) {
    const failureCountBeforePage = failures.length;
    const rowCountBeforePage = rows.length;
    const headings = new Set<string>();
    if (page.extractionError) {
      failures.push({ pageNumber: page.pageNumber, tableTitle: 'PAGE TEXT EXTRACTION', message: page.extractionError, runs: page.runs });
      diagnostics.push({
        pageNumber: page.pageNumber, pageRotation: page.rotation ?? 0,
        textItemCount: page.itemCount ?? page.runs.length, detectedTableHeadings: [],
        structuredExtractionSucceeded: false, manualReviewRequired: true, status: 'manual-review-required',
      });
      continue;
    }
    const lines: { y: number; runs: PdfTextRun[] }[] = [];
    for (const run of [...page.runs].filter((value) => value.text.trim()).sort((left, right) => right.y - left.y || left.x - right.x)) {
      const line = lines.find((candidate) => Math.abs(candidate.y - run.y) <= 1);
      if (line) line.runs.push(run);
      else lines.push({ y: run.y, runs: [run] });
    }
    for (const line of lines) line.runs.sort((left, right) => left.x - right.x);
    const context: Partial<Record<ContextKey, string>> = {};
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]!;
      const text = line.runs.map((run) => run.text).join(' ').trim();
      const contextMatch = /^([^:]+):\s*(.+)$/.exec(text);
      const key = contextMatch ? CONTEXT_LABELS[contextMatch[1]!.trim().toLowerCase() as keyof typeof CONTEXT_LABELS] : undefined;
      if (key && contextMatch?.[2]) {
        context[key] = contextMatch[2];
        if (key === 'manualNumber') manualNumbers.add(contextMatch[2]);
      }
      if (!tableTitles.test(text)) continue;
      headings.add(text);
      labeledTables += 1;
      const headerLine = lines[index + 1];
      const columns = headerLine?.runs.map((run) => ({ run, definition: headerColumn(run.text) }));
      const recognized = columns?.filter((column) => column.definition).length ?? 0;
      if (!columns || recognized < 2 || columns.some((column) => !column.definition)) {
        failures.push({ pageNumber: page.pageNumber, tableTitle: text, message: 'Table header/layout is unsupported; manual review required.', runs: page.runs });
        continue;
      }
      const columnKinds = columns.map((column) => column.definition!.kind);
      if (new Set(columnKinds).size !== columnKinds.length) {
        failures.push({ pageNumber: page.pageNumber, tableTitle: text, message: 'Duplicate header meanings are ambiguous; no settings extracted.', runs: page.runs });
        continue;
      }
      let rowNumber = 0;
      for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
        const body = lines[rowIndex]!;
        const bodyText = body.runs.map((run) => run.text).join(' ').trim();
        if (tableTitles.test(bodyText) || /^END TABLE(?:\s|$)/i.test(bodyText)) break;
        const cells = columns.map(() => '');
        const errors: string[] = [];
        for (const run of body.runs) {
          const matches = columns.flatMap((column, columnIndex) => Math.abs(run.x - column.run.x) <= 2 ? [columnIndex] : []);
          if (matches.length !== 1 || cells[matches[0]!] !== '') errors.push('Misaligned or multi-line cell: raw source row retained, no alignment guessed.');
          else cells[matches[0]!] = run.text;
        }
        const rowContext = { ...context };
        const physicalValues: LincolnPhysicalValue[] = [];
        let machineValue: string | undefined;
        if (!errors.length) columns.forEach((column, columnIndex) => {
          const cell = cells[columnIndex]!;
          const definition = column.definition!;
          if (!cell.trim()) {
            errors.push(`Blank source cell: ${column.run.text}. No value was filled.`);
            return;
          }
          if (definition.kind === 'setting') {
            machineValue = cell;
          } else if (['voltage', 'amperage', 'wireFeed', 'gasFlow'].includes(definition.kind)) {
            if (/^[A-Z]-\d+(?:\.\d+)?$/i.test(cell)) {
              machineValue = cell;
              errors.push('Machine code appears under a physical-parameter header; no numeric mapping was made.');
              return;
            }
            const value = physicalValue(definition.kind as LincolnPhysicalValue['kind'], cell, column.run.text, definition.unit);
            if (value) physicalValues.push(value);
            else errors.push(`Unrecognized or missing physical value/unit: ${column.run.text}; exact cell retained.`);
          } else rowContext[definition.kind as ContextKey] = cell;
        });
        const manufacturerMachineSetting = machineValue === undefined ? undefined : {
          value: machineValue,
          machineOrManual: rowContext.machine ?? title,
          ...(rowContext.manualNumber ? { manualNumber: rowContext.manualNumber } : {}),
        };
        rowNumber += 1;
        rows.push({
          pageNumber: page.pageNumber, tableTitle: text, rowNumber,
          category: manufacturerMachineSetting ? 'machine-specific' : errors.length || !physicalValues.length ? 'unsupported' : 'direct-parameters',
          context: rowContext, headers: columns.map((column) => column.run.text), cells, runs: body.runs,
          physicalValues, ...(manufacturerMachineSetting ? { manufacturerMachineSetting } : {}), errors,
        });
      }
    }
    const insufficientText = (page.itemCount ?? page.runs.length) < 2;
    if (insufficientText && failures.length === failureCountBeforePage) {
      failures.push({ pageNumber: page.pageNumber, tableTitle: 'UNREADABLE PAGE', message: 'Insufficient machine-readable text; manual review required.', runs: page.runs });
    }
    const hasFailure = failures.length > failureCountBeforePage;
    const hasStructuredRows = rows.length > rowCountBeforePage && !hasFailure;
    const needsReview = hasFailure || insufficientText || (headings.size > 0 && !hasStructuredRows);
    diagnostics.push({
      pageNumber: page.pageNumber, pageRotation: page.rotation ?? 0,
      textItemCount: page.itemCount ?? page.runs.length, detectedTableHeadings: [...headings],
      structuredExtractionSucceeded: hasStructuredRows,
      manualReviewRequired: needsReview,
      status: needsReview ? 'manual-review-required' : hasStructuredRows ? 'structured' : 'no-table-detected',
    });
  }
  if (!labeledTables && !failures.length) throw new Error(`No supported ${options.manufacturer ?? 'Lincoln'} welding-setting table title found. This PDF is not assumed to contain welding data.`);
  if (!rows.length && !failures.length) throw new Error('Recognized Lincoln table has no published rows.');
  const manualNumber = manualNumbers.size === 1 ? [...manualNumbers][0] : undefined;
  return { title, rows, failures, diagnostics, ...(manualNumber ? { manualNumber } : {}) };
}

export async function extractPdfText(bytes: Uint8Array): Promise<{ title: string; pages: readonly PdfTextPage[] }> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, stopAtErrors: true });
  try {
    const document = await task.promise;
    if (document.numPages > 100) throw new Error('PDF exceeds the 100-page supported extraction limit.');
    const metadata = await document.getMetadata();
    const info = metadata.info as Record<string, unknown>;
    const title = typeof info.Title === 'string' ? info.Title : '';
    const pages: PdfTextPage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const transformed: { text: string; x: number; y: number; angle: number }[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const a = item.transform[0]!;
        const b = item.transform[1]!;
        const e = item.transform[4]!;
        const f = item.transform[5]!;
        const matrix = viewport.transform;
        const x = matrix[0]! * e + matrix[2]! * f + matrix[4]!;
        const y = matrix[1]! * e + matrix[3]! * f + matrix[5]!;
        const baselineX = matrix[0]! * a + matrix[2]! * b;
        const baselineY = matrix[1]! * a + matrix[3]! * b;
        transformed.push({ text: item.str, x, y, angle: Math.atan2(baselineY, baselineX) });
      }
      const orientationBins = new Map<number, number>();
      for (const item of transformed) {
        const bin = Math.round(item.angle / (Math.PI / 36));
        orientationBins.set(bin, (orientationBins.get(bin) ?? 0) + item.text.length);
      }
      const dominantBin = [...orientationBins].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 0;
      const dominantAngle = dominantBin * Math.PI / 36;
      const cosine = Math.cos(dominantAngle);
      const sine = Math.sin(dominantAngle);
      const runs = transformed.map((item) => ({
        text: item.text,
        x: item.x * cosine + item.y * sine,
        y: item.x * sine - item.y * cosine,
      }));
      pages.push({ pageNumber, runs, rotation: page.rotate, itemCount: content.items.length });
    }
    return { title, pages };
  } finally { await task.destroy(); }
}

export async function extractLincolnPdf(bytes: Uint8Array, options: { tableTitles?: RegExp; manufacturer?: string } = {}): Promise<LincolnPdfTableResult> {
  const { title, pages } = await extractPdfText(bytes);
  return parseLincolnPdfTables(pages, title, options);
}

export function parseLincolnTabularText(text: string): LincolnPdfTableResult {
  const title = /^Document title:\s*(.+)$/im.exec(text)?.[1]?.trim();
  if (!title) throw new Error('Plain-text imports require an explicit "Document title:" line.');
  const runs: PdfTextRun[] = [];
  text.split(/\r?\n/).forEach((line, rowIndex) => {
    line.split('\t').forEach((cell, columnIndex) => {
      if (cell.trim()) runs.push({ text: cell.trim(), x: columnIndex * 100, y: -rowIndex * 10 });
    });
  });
  return parseLincolnPdfTables([{ pageNumber: 1, runs, itemCount: runs.length }], title);
}