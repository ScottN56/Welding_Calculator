import type {
  InterpolationPolicy,
  SourceReference,
  WeldingProcess,
  WeldingRecordSource,
} from '../types';
import type { DatasetClassification } from './datasetClassification';
import { createSourceReference } from './sourceReference';
import type { MachineSpecificDataset, ReferenceOnlyDataset } from '../../machine-profiles/machineSpecific';

export interface VerifiedDatasetMetadata<P extends WeldingProcess = WeldingProcess> {
  readonly id: string;
  readonly process: P;
  readonly source: SourceReference;
  readonly verifiedBy: string;
  readonly verifiedDate: string;
  readonly interpolationDefault?: InterpolationPolicy;
}

export interface VerifiedDataset<R extends WeldingRecordSource> {
  readonly classification: 'generic-recommendation';
  readonly metadata: VerifiedDatasetMetadata<R['process']>;
  readonly records: readonly R[];
}

export type ClassifiedDataset<R extends WeldingRecordSource> =
  | VerifiedDataset<R>
  | MachineSpecificDataset
  | ReferenceOnlyDataset;

export type VerifiedRecordSourceOverride = Partial<Pick<SourceReference, 'page' | 'tableOrChart'>>;

export type VerifiedRecordDraft<R extends WeldingRecordSource> = Omit<R, 'provenance'> & {
  readonly sourceOverride?: VerifiedRecordSourceOverride;
};

function requireCompletedMetadata(value: string, label: string): void {
  if (!value.trim()) {
    throw new Error(`${label} is required.`);
  }
  if (/^replace(?:\s|-)+with\b/i.test(value.trim())) {
    throw new Error(`${label} must be replaced with verified source information.`);
  }
}

export function defineVerifiedDataset<R extends WeldingRecordSource>(
  metadata: VerifiedDatasetMetadata<R['process']>,
  drafts: readonly VerifiedRecordDraft<R>[],
): VerifiedDataset<R> {
  requireCompletedMetadata(metadata.id, 'Dataset ID');
  requireCompletedMetadata(metadata.source.publisher, 'Source publisher');
  requireCompletedMetadata(metadata.source.document, 'Source document');
  requireCompletedMetadata(metadata.verifiedBy, 'verifiedBy');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.verifiedDate)) {
    throw new Error('verifiedDate must use YYYY-MM-DD.');
  }

  const records = drafts.map((draft) => {
    if (draft.process !== metadata.process) {
      throw new Error(`Record ${draft.id} does not match dataset process ${metadata.process}.`);
    }

    const { sourceOverride, ...recordDraft } = draft;
    const interpolation = draft.interpolation ?? metadata.interpolationDefault;
    return {
      ...recordDraft,
      ...(interpolation === undefined ? {} : { interpolation }),
      provenance: {
        verified: true,
        source: createSourceReference({ ...metadata.source, ...sourceOverride }),
        verifiedBy: metadata.verifiedBy,
        verifiedDate: metadata.verifiedDate,
      },
    } as R;
  });

  return { classification: 'generic-recommendation', metadata, records };
}

export function recordsFromDatasets<R extends WeldingRecordSource>(
  datasets: readonly VerifiedDataset<R>[],
): readonly R[] {
  return datasets.flatMap((dataset) => dataset.records);
}

export function datasetClassification<R extends WeldingRecordSource>(dataset: ClassifiedDataset<R>): DatasetClassification {
  return dataset.classification;
}
