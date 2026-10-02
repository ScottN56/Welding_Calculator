import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { WELDING_PROCESSES, type WeldingProcess } from '../../src/features/welding/types';
import { importOfficialSource } from './dispatch';
import { discoverOfficialSources, parseDiscoveryIndex, type DiscoveryCandidate } from './discovery';
import { loadState, saveState, STAGING_DIRECTORY, withStagingLock } from './storage';
import type { RetrievedSource, SourceImportState } from './types';

interface ImportOutcome {
  readonly sourceId: string;
  readonly url: string;
  readonly status: string;
  readonly message: string;
  readonly rowsAdded: number;
}

function formatCandidate(candidate: DiscoveryCandidate): string {
  const line = (label: string, value: string) => `${label}: ${value}`;
  return [
    `${candidate.manufacturer} source`,
    line('URL', candidate.sourceUrl),
    line('Title', candidate.title),
    line('Process', candidate.processes?.join(', ') || candidate.process || 'not explicitly detected'),
    line('Source type', candidate.sourceType),
    line('Readability', candidate.readability),
    line('Fields', candidate.fieldsDetected.join(', ') || 'none detected'),
    line('Missing', candidate.fieldsMissing.join(', ') || 'none'),
    line('Likely adapter', candidate.likelyAdapter),
    line('Existing importer', candidate.importerSupported ? 'supported' : 'not supported for automatic handoff'),
    line('Suitability', candidate.suitability),
    line('Reason', candidate.reason),
    line('Source hash', candidate.sourceHash ?? 'not downloaded'),
  ].join('\n');
}

function sourceType(candidate: DiscoveryCandidate, source: RetrievedSource): NonNullable<RetrievedSource['sourceType']> {
  if (candidate.sourceType === 'interactive-calculator') return 'interactive-calculator';
  if (source.mediaType === 'pdf') return 'pdf-table';
  return 'manufacturer-product-page';
}

async function persistDiscoveryIndex(path: string, index: Awaited<ReturnType<typeof discoverOfficialSources>>['index']): Promise<void> {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.tmp`;
  try { await writeFile(temporary, JSON.stringify(index, null, 2)); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}

export async function main(args: string[], environment: {
  readonly stagingDirectory?: string;
  readonly request?: typeof fetch;
  readonly now?: () => string;
  readonly wait?: (milliseconds: number) => Promise<void>;
} = {}): Promise<{ candidates: readonly DiscoveryCandidate[]; imports: readonly ImportOutcome[]; state?: SourceImportState }> {
  const { values } = parseArgs({ args, options: {
    manufacturer: { type: 'string' }, process: { type: 'string' }, 'import-good': { type: 'boolean' }, 'dry-run': { type: 'boolean' },
  } });
  if (values.process && !(WELDING_PROCESSES as readonly string[]).includes(values.process)) {
    throw new Error(`Unsupported process: ${values.process}. Choose ${WELDING_PROCESSES.join(', ')}.`);
  }
  const process = values.process as WeldingProcess | undefined;
  const stagingDirectory = environment.stagingDirectory ?? STAGING_DIRECTORY;
  const indexPath = join(stagingDirectory, 'discovery-index.json');
  const dryRun = Boolean(values['dry-run']);
  let returnedCandidates: readonly DiscoveryCandidate[] = [];
  let returnedImports: readonly ImportOutcome[] = [];
  let finalState: SourceImportState | undefined;

  await withStagingLock(stagingDirectory, dryRun, async () => {
    let indexText: string | undefined;
    try { indexText = await readFile(indexPath, 'utf8'); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') indexText = undefined;
      else throw error;
    }
    const discovery = await discoverOfficialSources({
      ...(values.manufacturer ? { manufacturer: values.manufacturer } : {}),
      ...(process ? { process } : {}),
    }, {
      ...(environment.request ? { request: environment.request } : {}),
      ...(environment.wait ? { wait: environment.wait } : {}),
      ...(environment.now ? { now: environment.now } : {}),
      index: parseDiscoveryIndex(indexText),
    });
    returnedCandidates = discovery.candidates;
    for (const candidate of discovery.candidates) console.log(formatCandidate(candidate));
    for (const warning of discovery.warnings) console.warn(`Discovery warning: ${warning}`);

    const imports: ImportOutcome[] = [];
    if (values['import-good']) {
      const statePath = join(stagingDirectory, 'imports.json');
      let state = await loadState(statePath);
      const retrievedByUrl = new Map(discovery.importedSources.map((source) => [source.url, source]));
      const snapshots: { source: RetrievedSource; sha256: string }[] = [];
      for (const candidate of discovery.candidates) {
        if (!['excellent', 'good'].includes(candidate.readability) || !candidate.importerSupported) continue;
        const retrieved = retrievedByUrl.get(candidate.sourceUrl);
        if (!retrieved) {
          imports.push({ sourceId: candidate.sourceId, url: candidate.sourceUrl, status: 'skipped', message: 'Candidate has no downloaded supported document.', rowsAdded: 0 });
          continue;
        }
        try {
          const source = { ...retrieved, sourceId: candidate.sourceId, sourceType: sourceType(candidate, retrieved) };
          const result = await importOfficialSource(source, state);
          const importedRows = result.status !== 'unsupported' && result.status !== 'unchanged' && result.addedRows > 0;
          state = result.state;
          imports.push({ sourceId: candidate.sourceId, url: candidate.sourceUrl, status: result.status, message: result.message, rowsAdded: result.addedRows });
          if (importedRows) snapshots.push({ source: retrieved, sha256: result.provenance.sha256 });
        } catch (error) {
          imports.push({ sourceId: candidate.sourceId, url: candidate.sourceUrl, status: 'unsupported',
            message: error instanceof Error ? error.message : 'Existing importer rejected this candidate.', rowsAdded: 0 });
        }
      }
      if (dryRun) console.log('Dry-run: supported candidates were parsed, but no staging state or discovery index was written.');
      else if (snapshots.length) await saveState(stagingDirectory, state, snapshots);
      finalState = state;
    }
    returnedImports = imports;
    if (!dryRun) await persistDiscoveryIndex(indexPath, discovery.index);
  });

  if (returnedImports.length) {
    for (const outcome of returnedImports) console.log(`Import ${outcome.status}: ${outcome.sourceId}; rows added ${outcome.rowsAdded}; ${outcome.message}`);
  }
  console.log(`Discovery complete: ${returnedCandidates.length} candidate(s); ${returnedImports.length} importer handoff(s).${dryRun ? ' Dry-run; no discovery index saved.' : ` Index: ${indexPath}`}`);
  return { candidates: returnedCandidates, imports: returnedImports, ...(finalState ? { state: finalState } : {}) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Official-source discovery failed.');
    process.exitCode = 1;
  });
}