import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { fetchSource } from './fetchSource';
import { importOfficialSource } from './dispatch';
import { APPROVED_SOURCES, approvedSourceUrl } from './sourceRegistry';
import { loadState, saveState, STAGING_DIRECTORY, withStagingLock } from './storage';

export async function main(args: string[], environment: { stagingDirectory?: string; request?: typeof fetch } = {}): Promise<void> {
  const { values } = parseArgs({ args, options: { url: { type: 'string' }, 'dry-run': { type: 'boolean' }, 'list-sources': { type: 'boolean' } } });
  if (values['list-sources']) {
    if (values.url || values['dry-run']) throw new Error('--list-sources cannot be combined with an import.');
    for (const source of APPROVED_SOURCES) console.log(`${source.domain} (and www${source.additionalHosts ? `, ${source.additionalHosts.join(', ')}` : ''}): ${source.parser ?? 'Approved domain; parser not implemented'}`);
    return;
  }
  if (!values.url) throw new Error('Usage: npm run welding:import -- [--dry-run] --url <official HTTPS URL>');
  const approved = approvedSourceUrl(values.url);
  if (!approved.source.parser) throw new Error(`No reviewed parser is implemented for ${approved.source.manufacturer}. Nothing fetched or staged.`);
  const stagingDirectory = environment.stagingDirectory ?? STAGING_DIRECTORY;
  const statePath = join(stagingDirectory, 'imports.json');
  await withStagingLock(stagingDirectory, Boolean(values['dry-run']), async () => {
    const state = await loadState(statePath);
    const retrieved = await fetchSource(approved.url.href, environment.request ?? fetch);
    let result;
    try {
      result = await importOfficialSource(retrieved, state);
    } catch (error) {
      if (retrieved.mediaType === 'pdf') console.error('Direct parameter rows: 0; machine-specific rows: 0; unsupported rows: 0; parse failures: 1. No staging data was modified.');
      throw error;
    }
    console.log(result.message);
    if (result.discovery) {
      console.log(`Source type: ${result.discovery.sourceType}`);
      console.log(`Public machine-readable dataset detected: ${result.discovery.publicDataDetected ? 'yes' : 'no'}`);
      for (const table of result.discovery.tables) console.log(`Table detected: ${table.title}\nClassification: ${table.classification}`);
      console.log(`Rows parsed: ${result.discovery.rowsParsed}\nRows eligible for generic recommendation staging: ${result.discovery.eligibleRows}`);
      for (const warning of result.discovery.warnings) if (warning !== result.message) console.log(warning);
    }
    console.log(`Rows added: ${result.addedRows}; valid: ${result.validRows}; rows requiring correction/review: ${result.rowsWithErrors}`);
    console.log(`Source SHA-256: ${result.provenance.sha256}`);
    if (result.categories) console.log(`Direct parameter rows: ${result.categories.directParameterRows}; machine-specific rows: ${result.categories.machineSettingRows}; unsupported rows: ${result.categories.unsupportedRows}; parse failures: ${result.categories.parseFailures}; duplicates skipped: ${result.categories.duplicatesSkipped}`);
    if (values['dry-run']) {
      console.log('Dry-run: no staging files, snapshots or import history were modified.');
      return;
    }
    if (result.status === 'unchanged' || result.status === 'unsupported') return;
    await saveState(stagingDirectory, result.state, [{ source: retrieved, sha256: result.provenance.sha256 }]);
    console.log(`Unverified staging file: ${statePath}. Import it using the developer Data Entry page; promotion remains a separate human step.`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Official-source import failed.');
    process.exitCode = 1;
  });
}