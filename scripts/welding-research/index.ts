import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { WELDING_PROCESSES, type WeldingProcess } from '../../src/features/welding/types';
import { approvedSourceUrl } from '../welding-source-import/sourceRegistry';
import { fetchSource } from '../welding-source-import/fetchSource';
import { importOfficialSource } from '../welding-source-import/dispatch';
import { hashSource } from '../welding-source-import/hashSource';
import { loadState, saveState, STAGING_DIRECTORY, withStagingLock } from '../welding-source-import/storage';
import type { RetrievedSource, SourceImportState } from '../welding-source-import/types';
import { createGoogleSearchProvider, GOOGLE_PROVIDER_NOT_CONFIGURED, loadResearchEnvironment } from './googleProvider';
import { buildResearchQueries, manufacturerFilter } from './queryBuilder';
import { rankSearchResults } from './resultRanker';
import { createRobotsAwareRequest } from './sourceFilter';
import type { SearchProvider } from './searchProvider';
import type { ResearchCandidate, ResearchFilters, ResearchReport } from './types';

interface ImportCandidateOutcome {
  readonly url: string;
  readonly sourceId: string;
  readonly status: string;
  readonly rowsAdded: number;
  readonly message: string;
}

function formatCandidate(candidate: ResearchCandidate): string {
  return [
    `${candidate.manufacturer ?? candidate.trust}`,
    `Title: ${candidate.title}`,
    `URL: ${candidate.url}`,
    `Snippet (discovery only; not a welding setting): ${candidate.snippet}`,
    `Process: ${candidate.detectedProcess ?? 'not explicitly detected'}`,
    `Material: ${candidate.detectedMaterial ?? 'not explicitly detected'}`,
    `Source type: ${candidate.sourceType}`,
    `Trust: ${candidate.trust}`,
    `Usefulness: ${candidate.usefulness} (${candidate.rank}, score ${candidate.score})`,
    `Signals: ${candidate.detectedFields.join(', ') || 'no explicitly labeled parameter fields'}`,
    `Action: ${candidate.eligibleForImporter ? 'candidate for importer; actual source still must parse' : 'research only'}`,
    `Reason: ${candidate.rankReasons.join('; ') || 'No positive official parameter-data signals.'}`,
  ].join('\n');
}

function stableSourceId(candidate: ResearchCandidate): string {
  return `research-${candidate.manufacturer?.toLowerCase().replace(/\s+/g, '-') ?? 'untrusted'}-${hashSource(new TextEncoder().encode(candidate.url)).slice(0, 16)}`;
}

function importedSourceType(source: RetrievedSource): NonNullable<RetrievedSource['sourceType']> {
  return source.mediaType === 'pdf' ? 'pdf-table' : 'manufacturer-product-page';
}

function reportPath(directory: string, timestamp: string): string {
  const safeTimestamp = timestamp.replace(/[:.]/g, '-');
  return join(directory, 'research-reports', `welding-research-${safeTimestamp}.json`);
}

export async function main(args: string[], environment: {
  readonly searchProvider?: SearchProvider;
  readonly request?: typeof fetch;
  readonly now?: () => string;
  readonly stagingDirectory?: string;
  readonly wait?: (milliseconds: number) => Promise<void>;
} = {}): Promise<{ readonly report: ResearchReport; readonly candidates: readonly ResearchCandidate[]; readonly imports: readonly ImportCandidateOutcome[]; readonly importedCount: number; readonly state?: SourceImportState }> {
  const { values } = parseArgs({ args, options: {
    query: { type: 'string' }, process: { type: 'string' }, manufacturer: { type: 'string' },
    material: { type: 'string' }, thickness: { type: 'string' }, wire: { type: 'string' },
    electrode: { type: 'string' }, 'wire-diameter': { type: 'string' }, 'shielding-gas': { type: 'string' },
    'gas-flow': { type: 'string' }, 'import-candidates': { type: 'boolean' }, 'save-report': { type: 'boolean' },
  } });
  if (values.process && !(WELDING_PROCESSES as readonly string[]).includes(values.process)) {
    throw new Error(`Unsupported process: ${values.process}. Choose ${WELDING_PROCESSES.join(', ')}.`);
  }
  if (!values.query && !values.process && !values.material && !values.wire && !values.electrode) {
    throw new Error('Provide --query or at least one of --process, --material, --wire or --electrode.');
  }
  const manufacturer = manufacturerFilter(values.manufacturer);
  const filters: ResearchFilters = {
    ...(values.query ? { query: values.query } : {}),
    ...(manufacturer ? { manufacturer } : {}),
    ...(values.process ? { process: values.process as WeldingProcess } : {}),
    ...(values.material ? { material: values.material } : {}),
    ...(values.thickness ? { thickness: values.thickness } : {}),
    ...(values.wire ? { wire: values.wire } : {}),
    ...(values.electrode ? { electrode: values.electrode } : {}),
    ...(values['wire-diameter'] ? { wireDiameter: values['wire-diameter'] } : {}),
    ...(values['shielding-gas'] ? { shieldingGas: values['shielding-gas'] } : {}),
    ...(values['gas-flow'] ? { gasFlow: values['gas-flow'] } : {}),
  };
  loadResearchEnvironment();
  const providerResult = environment.searchProvider
    ? { provider: environment.searchProvider }
    : createGoogleSearchProvider();
  const queries = buildResearchQueries(filters);
  const timestamp = environment.now?.() ?? new Date().toISOString();
  const stagingDirectory = environment.stagingDirectory ?? STAGING_DIRECTORY;
  if (!providerResult.provider) {
    console.log(GOOGLE_PROVIDER_NOT_CONFIGURED);
    const report: ResearchReport = {
      query: queries.map((entry) => entry.query).join('\n'), timestamp,
      provider: 'Google Custom Search JSON API (not configured)', filters, candidateUrls: [],
    };
    if (values['save-report']) {
      const path = reportPath(stagingDirectory, timestamp);
      await mkdir(join(stagingDirectory, 'research-reports'), { recursive: true });
      await writeFile(path, JSON.stringify(report, null, 2));
      console.log(`Research report: ${path}`);
    }
    return { report, candidates: [], imports: [], importedCount: 0 };
  }

  const provider = providerResult.provider;
  const rawResults = (await Promise.all(queries.map((entry) => provider.search(entry.query)))).flat();
  let candidates = [...rankSearchResults(rawResults, filters)];
  for (const candidate of candidates) console.log(formatCandidate(candidate));
  const imports: ImportCandidateOutcome[] = [];
  let finalState: SourceImportState | undefined;

  if (values['import-candidates']) {
    const eligible = candidates.filter((candidate) => candidate.eligibleForImporter && candidate.trust === 'official');
    const statePath = join(stagingDirectory, 'imports.json');
    const request = createRobotsAwareRequest({
      ...(environment.request ? { request: environment.request } : {}),
      ...(environment.wait ? { wait: environment.wait } : {}),
    });
    const snapshots: { source: RetrievedSource; sha256: string }[] = [];
    await withStagingLock(stagingDirectory, false, async () => {
      let state = await loadState(statePath);
      for (const candidate of eligible) {
        try {
          const approved = approvedSourceUrl(candidate.url);
          if (approved.source.manufacturer !== candidate.manufacturer) continue;
          const fetched = await fetchSource(approved.url.href, request);
          const sourceId = stableSourceId(candidate);
          const source = { ...fetched, sourceId, sourceType: importedSourceType(fetched) };
          const result = await importOfficialSource(source, state);
          state = result.state;
          imports.push({ url: candidate.url, sourceId, status: result.status, rowsAdded: result.addedRows, message: result.message });
          if (result.status === 'imported' || result.status === 'changed') snapshots.push({ source: fetched, sha256: result.provenance.sha256 });
        } catch (error) {
          imports.push({ url: candidate.url, sourceId: stableSourceId(candidate), status: 'rejected', rowsAdded: 0,
            message: error instanceof Error ? error.message : 'Existing importer rejected the source.' });
        }
      }
      if (snapshots.length > 0) await saveState(stagingDirectory, state, snapshots);
      finalState = state;
    });
    const outcomeByUrl = new Map(imports.map((outcome) => [outcome.url, outcome]));
    candidates = candidates.map((candidate) => {
      const outcome = outcomeByUrl.get(candidate.url);
      return outcome ? { ...candidate, importerResult: `${outcome.status}: ${outcome.message}` } : candidate;
    });
    for (const outcome of imports) console.log(`Importer ${outcome.status}: ${outcome.url}; ${outcome.rowsAdded} row(s) added. ${outcome.message}`);
    console.log('Imported records remain unverified staging data; review and manual verification are required.');
  }

  const report: ResearchReport = {
    query: queries.map((entry) => entry.query).join('\n'), timestamp, provider: provider.name, filters,
    candidateUrls: candidates.map((candidate) => ({
      url: candidate.url, manufacturer: candidate.manufacturer, trust: candidate.trust,
      usefulness: candidate.usefulness, rank: candidate.rank, score: candidate.score,
    })),
  };
  if (values['save-report']) {
    const path = reportPath(stagingDirectory, timestamp);
    await mkdir(join(stagingDirectory, 'research-reports'), { recursive: true });
    await writeFile(path, JSON.stringify(report, null, 2));
    console.log(`Research report (no credentials stored): ${path}`);
  }
  console.log(`Research complete: ${candidates.length} official candidate(s); ${imports.length} importer outcome(s).`);
  return { report, candidates, imports, importedCount: imports.reduce((total, outcome) => total + outcome.rowsAdded, 0), ...(finalState ? { state: finalState } : {}) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Welding source research failed.');
    process.exitCode = 1;
  });
}