import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { WELDING_PROCESSES, type WeldingProcess } from '../../src/features/welding/types';
import { OFFICIAL_SCAN_SOURCES, type ScanSource } from './sources';
import { scanSources } from './scanSources';
import { loadState, saveState, STAGING_DIRECTORY, withStagingLock } from './storage';
import type { Manufacturer } from './types';

export async function scanMain(args: string[], environment: { catalog?: readonly ScanSource[]; stagingDirectory?: string; request?: typeof fetch } = {}) {
  const { values } = parseArgs({ args, options: {
    'dry-run': { type: 'boolean' }, 'changed-only': { type: 'boolean' }, manufacturer: { type: 'string' }, process: { type: 'string' },
  } });
  const names: Record<string, Manufacturer> = { miller: 'Miller', lincoln: 'Lincoln Electric', esab: 'ESAB' };
  const manufacturer = values.manufacturer ? names[values.manufacturer.toLowerCase()] : undefined;
  if (values.manufacturer && !manufacturer) throw new Error('Manufacturer must be miller, lincoln or esab.');
  if (values.process && !(WELDING_PROCESSES as readonly string[]).includes(values.process)) throw new Error('Process must be GMAW, FCAW, GTAW or SMAW; unknown source processes are never inferred.');
  const directory = environment.stagingDirectory ?? STAGING_DIRECTORY;
  return withStagingLock(directory, Boolean(values['dry-run']), async () => {
    const state = await loadState(join(directory, 'imports.json'));
    const result = await scanSources(environment.catalog ?? OFFICIAL_SCAN_SOURCES, state, {
      ...(manufacturer ? { manufacturer } : {}), ...(values.process ? { process: values.process as WeldingProcess } : {}),
      dryRun: Boolean(values['dry-run']), changedOnly: Boolean(values['changed-only']),
    }, { ...(environment.request ? { request: environment.request } : {}) });
    for (const outcome of result.report.outcomes) console.log(`${outcome.sourceId}: ${outcome.message}`);
    console.log('Official welding-source scan summary');
    console.log(JSON.stringify(result.report, null, 2));
    if (values['dry-run']) console.log('Dry-run: no staging data, history, snapshots or last-scan report were modified.');
    else await saveState(directory, result.state, result.snapshots);
    return result.report;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  scanMain(process.argv.slice(2)).then((report) => {
    if (report.failures.length || report.duplicateConflicts.length) process.exitCode = 1;
  }).catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Source scan failed.'); process.exitCode = 1; });
}