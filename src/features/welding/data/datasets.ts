import type {
  InterpolationPolicy,
  SourceReference,
  WeldingProcess,
  WeldingRecordSource,
} from '../types';

export interface VerifiedDatasetMetadata<P extends WeldingProcess = WeldingProcess> {
  /** Stable internal identifier for the source pack, e.g. "manufacturer-document-edition". */
  readonly id: string;
  readonly process: P;
  readonly source: SourceReference;
  readonly verifiedBy: string;
  readonly verifiedDate: string;
  /**
   * Optional default applied only when an individual record omits interpolation.
   * Omit this to preserve the global safe default: interpolation disabled.
   */
  readonly interpolationDefault?: InterpolationPolicy;
  readonly notes?: readonly string[];
}

export type VerifiedRecordDraft<R extends WeldingRecordSource> = Omit<R, 'provenance'>;

export interface VerifiedDataset<R extends WeldingRecordSource> {
  readonly metadata: VerifiedDatasetMetadata<R['process']>;
  readonly records: readonly R[];
}

function assertMetadata<P extends WeldingProcess>(metadata: VerifiedDatasetMetadata<P>): void {
  if (metadata.id.trim() === '') throw new Error('Verified dataset id must not be empty.');
  if (metadata.source.publisher.trim() === '') throw new Error(`Verified dataset ${metadata.id}: publisher is required.`);
  if (metadata.source.document.trim() === '') throw new Error(`Verified dataset ${metadata.id}: document is required.`);
  if (metadata.verifiedBy.trim() === '') throw new Error(`Verified dataset ${metadata.id}: verifiedBy is required.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.verifiedDate)) {
    throw new Error(`Verified dataset ${metadata.id}: verifiedDate must use YYYY-MM-DD.`);
  }
}

/**
 * Defines a pack of verified records from one documented source.
 *
 * The helper stamps every record with identical source/verifier provenance and enforces
 * that all records belong to the dataset's declared welding process.
 *
 * No welding values are generated or inferred here; callers must enter them from the
 * cited reference document.
 */
export function defineVerifiedDataset<R extends WeldingRecordSource>(
  metadata: VerifiedDatasetMetadata<R['process']>,
  drafts: readonly VerifiedRecordDraft<R>[],
): VerifiedDataset<R> {
  assertMetadata(metadata);

  const records = drafts.map((draft) => {
    if (draft.process !== metadata.process) {
      throw new Error(
        `Verified dataset ${metadata.id}: record ${draft.id} uses process ${draft.process}, expected ${metadata.process}.`,
      );
    }

    return {
      ...draft,
      interpolation: draft.interpolation ?? metadata.interpolationDefault,
      provenance: {
        verified: true,
        source: metadata.source,
        verifiedBy: metadata.verifiedBy,
        verifiedDate: metadata.verifiedDate,
      },
    } as R;
  });

  return { metadata, records };
}

export function recordsFromDatasets<R extends WeldingRecordSource>(
  datasets: readonly VerifiedDataset<R>[],
): readonly R[] {
  return datasets.flatMap((dataset) => dataset.records);
}
