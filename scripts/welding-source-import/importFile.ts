import { readFile, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { OFFICIAL_SCAN_SOURCES, validateScanSource } from './sources';
import { importOfficialSource } from './dispatch';
import { hashSource } from './hashSource';
import { createImportBatch, createImportBatchId } from '../../src/features/welding/data/staging/importBatch';
import { loadState, saveState, STAGING_DIRECTORY, withStagingLock } from './storage';
import type { SourceMediaType } from './types';

const MAX_LOCAL_SOURCE_BYTES = 25 * 1024 * 1024;

function mediaTypeForFile(path: string): SourceMediaType {
  const extension = extname(path).toLowerCase();
  if (extension === '.pdf') return 'pdf';
  if (extension === '.html' || extension === '.htm') return 'html';
  if (extension === '.json') return 'json';
  if (extension === '.txt') return 'text';
  throw new Error(`Unsupported local file extension: ${extension || '(none)'}. Use PDF, HTML, JSON or plain text.`);
}

function assertCompatible(source: (typeof OFFICIAL_SCAN_SOURCES)[number], mediaType: SourceMediaType): void {
  const compatible = source.adapter === 'esab' ? mediaType === 'html'
    : source.adapter === 'lincoln-pdf' ? mediaType === 'pdf' || mediaType === 'text'
      : mediaType === 'pdf' || mediaType === 'html' || mediaType === 'json';
  if (!compatible) throw new Error(`${mediaType.toUpperCase()} is not supported by the reviewed ${source.adapter} adapter for source ${source.id}.`);
}

export async function main(args: string[], environment: { stagingDirectory?: string; now?: () => Date } = {}): Promise<void> {
  const { values } = parseArgs({ args, options: {
    source: { type: 'string' }, file: { type: 'string' }, 'dry-run': { type: 'boolean' },
  } });
  if (!values.source || !values.file) throw new Error('Usage: npm run welding:import-file -- [--dry-run] --source <source-id> --file <path>');
  const source = OFFICIAL_SCAN_SOURCES.find((candidate) => candidate.id === values.source);
  if (!source) throw new Error(`Unknown source ID: ${values.source}. Select an enabled entry from scripts/welding-source-import/sources.ts.`);
  if (!source.enabled) throw new Error(`Source is disabled in the approved catalog: ${source.id}`);
  if (!source.sourceType) throw new Error(`Catalog source is missing its required source type: ${source.id}`);
  validateScanSource(source);
  const mediaType = mediaTypeForFile(values.file);
  assertCompatible(source, mediaType);
  const localPath = resolve(values.file);
  const fileInfo = await stat(localPath);
  if (!fileInfo.isFile()) throw new Error('Local source path must name a regular file.');
  if (fileInfo.size > MAX_LOCAL_SOURCE_BYTES) throw new Error('Local source exceeds the 25 MiB import limit.');
  const bytes = new Uint8Array(await readFile(localPath));
  if (mediaType === 'pdf' && new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('Local PDF file does not have a PDF signature.');
  let text = '';
  if (mediaType !== 'pdf') {
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new Error('Local text source must be valid UTF-8.'); }
  }
  if (mediaType === 'json') {
    try { JSON.parse(text); }
    catch { throw new Error('Local JSON source is malformed.'); }
  }
  const importTimestamp = (environment.now ?? (() => new Date()))().toISOString();
  const expectedParser = source.adapter === 'esab' ? ['esab-recommended-welding-parameters-html', '1.0.0']
    : source.adapter === 'lincoln-pdf' ? ['lincoln-pdf-setting-tables', '1.0.0']
      : ['miller-public-source-data', '1.0.0'];
  const batchId = createImportBatchId({ sourceId: source.id, sourceHash: hashSource(bytes), importTimestamp,
    localFileName: basename(localPath), parserName: expectedParser[0]!, parserVersion: expectedParser[1]! });
  const localSource = {
    url: source.url, manufacturer: source.manufacturer, retrievedAt: importTimestamp,
    bytes, html: text, mediaType, sourceId: source.id, sourceType: source.sourceType,
    ...(source.sourceClassification ? { sourceClassification: source.sourceClassification } : {}),
    localFileName: basename(localPath), importTimestamp,
    batchId,
  } as const;
  const sha256 = hashSource(bytes);
  const stagingDirectory = environment.stagingDirectory ?? STAGING_DIRECTORY;
  const statePath = join(stagingDirectory, 'imports.json');
  await withStagingLock(stagingDirectory, Boolean(values['dry-run']), async () => {
    const state = await loadState(statePath);
    const result = await importOfficialSource(localSource, state);
    const previousBatch = [...(state.batches ?? [])].reverse().find((batch) => batch.sourceId === source.id);
    const previousSource = [...state.sources].reverse().find((item) => item.sourceId === source.id);
    const sourceChanged = (previousBatch?.sourceHash ?? previousSource?.sha256) !== undefined &&
      (previousBatch?.sourceHash ?? previousSource?.sha256) !== sha256;
    const batchRows = result.batchRows ?? [];
    const parsedRows = Math.max(0, batchRows.length - (result.categories?.parseFailures ?? 0));
    const batch = createImportBatch({
      sourceId: source.id, manufacturer: source.manufacturer, sourceUrl: source.url,
      documentTitle: result.provenance.documentTitle || source.id, localFileName: basename(localPath),
      sourceHash: sha256, parserName: result.provenance.parserName, parserVersion: result.provenance.parserVersion,
      importTimestamp, dryRun: Boolean(values['dry-run']), rowsAcceptedIntoStaging: result.addedRows,
      parserWarnings: [
        ...(sourceChanged ? ['Source snapshot changed — compare against previously reviewed data before promotion.'] : []),
        ...(result.discovery?.warnings ?? []),
        ...(result.status === 'unsupported' ? [result.message] : []),
        ...(result.pdfDiagnostics ?? []).filter((diagnostic) => diagnostic.manualReviewRequired)
          .map((diagnostic) => `PDF page ${diagnostic.pageNumber}: manual review required.`),
      ],
      sourceChanged, stagingRows: batchRows, priorRows: state.rows, rowsParsed: parsedRows,
    });
    console.log(result.message);
    console.log(`Source ID: ${source.id}\nSource type: ${source.sourceType ?? source.expectedSourceType}\nManufacturer: ${source.manufacturer}`);
    console.log(`Local filename: ${basename(localPath)}\nImport timestamp: ${importTimestamp}\nSHA-256: ${sha256}`);
    console.log(`Import batch: ${batch.batchId}\nRows discovered: ${batch.rowsDiscovered}; parsed: ${batch.rowsParsed}; accepted into staging: ${batch.rowsAcceptedIntoStaging}; validation errors: ${batch.rowsWithValidationErrors}; unsupported: ${batch.unsupportedRows}; duplicates: ${batch.duplicateRows}`);
    console.log(`Rows added: ${result.addedRows}; valid: ${result.validRows}; rows requiring review/correction: ${result.rowsWithErrors}`);
    if (result.categories) console.log(`Direct parameter rows: ${result.categories.directParameterRows}; machine-specific rows: ${result.categories.machineSettingRows}; unsupported rows: ${result.categories.unsupportedRows}; parse failures: ${result.categories.parseFailures}`);
    for (const diagnostic of result.pdfDiagnostics ?? []) {
      console.log(`PDF page ${diagnostic.pageNumber}: rotation ${diagnostic.pageRotation}; text items ${diagnostic.textItemCount}; headings ${diagnostic.detectedTableHeadings.join(' | ') || '(none)'}; structured extraction ${diagnostic.structuredExtractionSucceeded ? 'succeeded' : 'not established'}; ${diagnostic.status}`);
    }
    if (values['dry-run']) {
      console.log('Dry-run: no staging files, snapshots or import history were modified.');
      return;
    }
    const nextState = { ...result.state, batches: [...(result.state.batches ?? []), batch] };
    await saveState(stagingDirectory, nextState, [{ source: localSource, sha256 }]);
    console.log(`Unverified staging file: ${statePath}. Human review and manual verification remain separate steps.`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Local official-source import failed.');
    process.exitCode = 1;
  });
}