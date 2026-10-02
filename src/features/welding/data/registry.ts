import type { RecordByProcess, WeldingProcess, WeldingRecord, WeldingRecordSource } from '../types';
import { normalizeRecord } from './normalize';
import { gmawRecords } from './records/gmaw';
import { gmawSampleRecords } from './sample/gmawSample';
import { validateRecordSources } from './validate';

export interface RecordRegistry {
  readonly all: readonly WeldingRecord[];
  forProcess<P extends WeldingProcess>(process: P): readonly RecordByProcess[P][];
  hasVerifiedData(process: WeldingProcess): boolean;
}

/** Validates and normalizes source records. Throws if any record is invalid so bad data never reaches the UI. */
export function createRegistry(sources: readonly WeldingRecordSource[]): RecordRegistry {
  const errors = validateRecordSources(sources);
  if (errors.length > 0) {
    throw new Error(`Invalid welding reference data:\n${errors.join('\n')}`);
  }
  const all = sources.map(normalizeRecord);
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

/**
 * Production source list. Keep this export limited to records intended for release.
 * The production-data test fails if anything here is unverified.
 */
export const VERIFIED_RECORD_SOURCES: readonly WeldingRecordSource[] = [...gmawRecords];

/**
 * Vite replaces import.meta.env.PROD at build time. Sample data is available only in development/test builds.
 * Production runtime data is built exclusively from VERIFIED_RECORD_SOURCES.
 */
export const ALL_RECORD_SOURCES: readonly WeldingRecordSource[] = import.meta.env.PROD
  ? VERIFIED_RECORD_SOURCES
  : [...VERIFIED_RECORD_SOURCES, ...gmawSampleRecords];

export const registry: RecordRegistry = createRegistry(ALL_RECORD_SOURCES);
