import type { SourceReference, WeldingRecordSource } from '../../types';
import { defineVerifiedDataset, type VerifiedDataset, type VerifiedDatasetMetadata, type VerifiedRecordDraft } from '../datasets';
import { createSourceReference } from '../sourceReference';
import { validateRecordSource } from '../validate';
import { validateVerifiedDatasets } from '../validateDatasets';
import { validateStagedRecord } from './validateStagedRecord';
import type { StagedWeldingRecord } from './types';

const SOURCE_FIELDS: readonly (keyof SourceReference)[] = [
  'publisher',
  'document',
  'edition',
  'publicationDate',
  'page',
  'tableOrChart',
  'url',
  'accessedDate',
  'notes',
];

export type PromoteStagedRecordResult<R extends WeldingRecordSource> =
  | { readonly ok: true; readonly record: R }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Promotes only an explicitly reviewed, valid staged record and stamps verified provenance. */
export function promoteStagedRecord<R extends WeldingRecordSource>(
  staged: StagedWeldingRecord<R>,
  metadata: VerifiedDatasetMetadata<R['process']>,
): PromoteStagedRecordResult<R> {
  const validated = validateStagedRecord(staged);
  const errors = [...validated.validationErrors];
  const draft = validated.draft as unknown as WeldingRecordSource;

  if (staged.reviewStatus !== 'ready') {
    errors.push('Manual review status must be ready before promotion.');
  }
  if (!validated.readyForVerification) {
    errors.push('The staged record must pass validation before promotion.');
  }
  if (staged.sourceDatasetId !== metadata.id) {
    errors.push('Source dataset ID must match the verified dataset metadata.');
  }
  if (draft.provenance.verified) {
    errors.push('Staged records cannot be marked verified before promotion.');
  }
  if (draft.process !== metadata.process) {
    errors.push('Staged record process does not match verified dataset process.');
  }

  const metadataDataset: VerifiedDataset<R> = { classification: 'generic-recommendation', metadata, records: [] };
  errors.push(...validateVerifiedDatasets([metadataDataset as VerifiedDataset<WeldingRecordSource>]));

  const promotedSource = createSourceReference({ ...metadata.source, ...staged.sourceOverride });
  for (const field of SOURCE_FIELDS) {
    if ((draft.provenance.source[field] ?? undefined) !== (promotedSource[field] ?? undefined)) {
      errors.push(`Staged record source ${field} does not match dataset metadata or its page/chart override.`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const { provenance, ...recordFields } = staged.draft;
  void provenance;
  const verifiedDraft = {
    ...recordFields,
    ...(staged.sourceOverride === undefined ? {} : { sourceOverride: staged.sourceOverride }),
  } as unknown as VerifiedRecordDraft<R>;

  try {
    const dataset = defineVerifiedDataset<R>(metadata, [verifiedDraft]);
    const datasetErrors = validateVerifiedDatasets([dataset as VerifiedDataset<WeldingRecordSource>]);
    if (datasetErrors.length > 0) return { ok: false, errors: datasetErrors };

    const record = dataset.records[0];
    if (!record) return { ok: false, errors: ['Promotion did not produce a record.'] };

    const recordErrors = validateRecordSource(record);
    if (recordErrors.length > 0) return { ok: false, errors: recordErrors };

    return { ok: true, record };
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : 'Failed to promote staged record.'],
    };
  }
}
