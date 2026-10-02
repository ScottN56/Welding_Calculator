import type { RecordByProcess, WeldingProcess, WeldingRecord, WeldingRecordSource } from '../types';
import { normalizeRecord } from './normalize';
import { fcawVerifiedDatasets } from './records/fcaw';
import { gmawVerifiedDatasets } from './records/gmaw';
import { gtawVerifiedDatasets } from './records/gtaw';
import { gmawSampleRecords } from './sample/gmawSample';
import { recordsFromDatasets, type VerifiedDataset } from './datasets';
import { validateVerifiedDatasets } from './validateDatasets';
import { validateRecordSources } from './validate';

export interface RecordRegistry {
  readonly all: readonly WeldingRecord[];
  forProcess<P extends WeldingProcess>(process: P): readonly RecordByProcess[P][];
  hasVerifiedData(process: WeldingProcess): boolean;
}

export function assertVerifiedProductionRecords(sources: readonly WeldingRecordSource[]): void {
  const unverified = sources.filter((source) => !source.provenance.verified);
  if (unverified.length > 0) {
    const ids = unverified.map((source) => source.id).join(', ');
    throw new Error(`Production welding data contains unverified records: ${ids}`);
  }
}

/** Validates and normalizes source records. Throws if any record is invalid so bad data never reaches the UI. */
export function createRegistry(
  sources: readonly WeldingRecordSource[],
  options: {
    readonly requireVerified?: boolean;
    readonly verifiedDatasets?: readonly VerifiedDataset<WeldingRecordSource>[];
  } = {},
): RecordRegistry {
  const verifiedDatasets = options.verifiedDatasets;
  if (verifiedDatasets) {
    const datasetErrors = validateVerifiedDatasets(verifiedDatasets);
    if (datasetErrors.length > 0) {
      throw new Error(`Invalid verified welding datasets:\n${datasetErrors.join('\n')}`);
    }
  }
  if (options.requireVerified) {
    if (!verifiedDatasets) {
      throw new Error('Verified dataset metadata is required for production welding records.');
    }
    assertVerifiedProductionRecords(sources);

    const datasetRecords = new Set(verifiedDatasets.flatMap((dataset) => dataset.records));
    if (datasetRecords.size !== sources.length || sources.some((source) => !datasetRecords.has(source))) {
      throw new Error('Production welding records must come from the validated verified datasets.');
    }
  }
  const errors = validateRecordSources(sources);
  if (errors.length > 0) {
    throw new Error(`Invalid welding reference data:\n${errors.join('\n')}`);
  }
  const all = sources.map(normalizeRecord);
  // Cached so callers get a stable array reference (safe as a React memo dependency).
  const byProcess = new Map<WeldingProcess, readonly WeldingRecord[]>();

  return {
    all,
    forProcess: <P extends WeldingProcess>(process: P) => {
      let list = byProcess.get(process);
      if (!list) {
        list = all.filter((r) => r.process === process);
        byProcess.set(process, list);
      }
      return list as readonly RecordByProcess[P][];
    },
    hasVerifiedData: (process) => all.some((r) => r.process === process && r.provenance.verified),
  };
}

export const VERIFIED_DATASETS: readonly VerifiedDataset<WeldingRecordSource>[] = [
  ...gmawVerifiedDatasets,
  ...fcawVerifiedDatasets,
  ...gtawVerifiedDatasets,
];

export const VERIFIED_RECORD_SOURCES: readonly WeldingRecordSource[] =
  recordsFromDatasets(VERIFIED_DATASETS);

export const ALL_RECORD_SOURCES: readonly WeldingRecordSource[] = __WELDING_INCLUDE_SAMPLE_DATA__
  ? [...VERIFIED_RECORD_SOURCES, ...gmawSampleRecords]
  : [...VERIFIED_RECORD_SOURCES];

export const registry: RecordRegistry = createRegistry(ALL_RECORD_SOURCES, {
  requireVerified: !__WELDING_INCLUDE_SAMPLE_DATA__,
  verifiedDatasets: VERIFIED_DATASETS,
});
