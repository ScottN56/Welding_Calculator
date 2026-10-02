import type { WeldingRecordSource } from '../../types';
import { validateRecordSource } from '../validate';
import type { StagedWeldingRecord } from './types';

/** Revalidates a staged draft without changing or filling any record values. */
export function validateStagedRecord<R extends WeldingRecordSource>(
  staged: StagedWeldingRecord<R>,
): StagedWeldingRecord<R> {
  const errors: string[] = [];
  const draft = staged.draft as unknown as WeldingRecordSource;

  if (!staged.sourceDatasetId.trim()) {
    errors.push('Source dataset ID is required.');
  }
  if (draft.provenance.verified) {
    errors.push('A staged record must remain unverified until manual promotion.');
  }
  if (staged.sourceClassification !== undefined && staged.sourceClassification !== 'recommended-setting') {
    errors.push(`Source classification ${staged.sourceClassification} is not eligible for generic recommendation promotion.`);
  }
  errors.push(...validateRecordSource(draft));

  return {
    ...staged,
    validationErrors: errors,
    readyForVerification: errors.length === 0,
  };
}
