import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importStagedJson } from '../../src/features/welding/data/staging/importExport/json';
import { isObject, STAGING_FILE_FORMAT, STAGING_FILE_VERSION } from '../../src/features/welding/data/staging/importExport/types';
import { approvedSourceUrl } from './sourceRegistry';
import { isImportBatch } from '../../src/features/welding/data/staging/importBatch';
import { emptyImportState } from './importSource';
import type { RetrievedSource, SourceImportProvenance, SourceImportState } from './types';

export const STAGING_DIRECTORY = fileURLToPath(new URL('../../.welding-source-staging/', import.meta.url));

function isSourceHistory(value: unknown): value is SourceImportProvenance {
  if (!isObject(value)) return false;
  const fields = ['manufacturer', 'sourceUrl', 'documentTitle', 'retrievedAt', 'parserName', 'parserVersion', 'sha256'];
  if (!fields.every((key) => typeof value[key] === 'string' && value[key] !== '')) return false;
  try {
    return approvedSourceUrl(String(value.sourceUrl)).source.manufacturer === value.manufacturer &&
      /^[a-f0-9]{64}$/.test(String(value.sha256)) && Number.isFinite(Date.parse(String(value.retrievedAt)));
  } catch { return false; }
}

export async function loadState(path: string): Promise<SourceImportState> {
  let text: string;
  try { text = await readFile(path, 'utf8'); }
  catch (error) {
    if (isObject(error) && error.code === 'ENOENT') return emptyImportState();
    throw error;
  }
  const parsed: unknown = JSON.parse(text);
  if (!isObject(parsed) || parsed.format !== STAGING_FILE_FORMAT || parsed.version !== STAGING_FILE_VERSION ||
    !Array.isArray(parsed.rows) || !Array.isArray(parsed.sources) || !parsed.sources.every(isSourceHistory) ||
    (parsed.batches !== undefined && (!Array.isArray(parsed.batches) || !parsed.batches.every(isImportBatch)))) {
    throw new Error('Invalid staging import history. Existing file will not be overwritten.');
  }
  return { format: STAGING_FILE_FORMAT, version: STAGING_FILE_VERSION, sources: parsed.sources, rows: importStagedJson(text).rows,
    ...(Array.isArray(parsed.batches) ? { batches: parsed.batches } : {}),
    ...(isObject(parsed.lastScan) ? { lastScan: parsed.lastScan } : {}) };
}

export async function withStagingLock<T>(directory: string, dryRun: boolean, action: () => Promise<T>): Promise<T> {
  const lockPath = join(directory, 'import.lock');
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  try {
    if (!dryRun) { await mkdir(directory, { recursive: true }); lock = await open(lockPath, 'wx'); }
    return await action();
  } finally {
    if (lock) { await lock.close(); await rm(lockPath, { force: true }); }
  }
}

export async function saveState(directory: string, state: SourceImportState, snapshots: readonly { source: RetrievedSource; sha256: string }[]): Promise<void> {
  for (const snapshot of snapshots) {
    const sourceDirectory = join(directory, 'sources');
    await mkdir(sourceDirectory, { recursive: true });
    const extension = snapshot.source.mediaType ?? 'html';
    await writeFile(join(sourceDirectory, `${snapshot.sha256}.${extension}`), snapshot.source.bytes);
  }
  const statePath = join(directory, 'imports.json');
  const temporaryPath = `${statePath}.tmp`;
  try { await writeFile(temporaryPath, JSON.stringify(state, null, 2)); await rename(temporaryPath, statePath); }
  finally { await rm(temporaryPath, { force: true }); }
}