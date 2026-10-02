import type { Provenance, WeldingRecordSource } from '../../types';
import type { VerifiedRecordSourceOverride } from '../datasets';

export const STAGED_REVIEW_STATUSES = ['draft', 'needs-review', 'ready', 'rejected'] as const;
export type StagedReviewStatus = (typeof STAGED_REVIEW_STATUSES)[number];

export const SOURCE_CLASSIFICATIONS = [
  'recommended-setting', 'machine-capability', 'machine-specific-setting', 'reference-guidance', 'unsupported',
] as const;
export type SourceClassification = (typeof SOURCE_CLASSIFICATIONS)[number];

export interface ManufacturerMachineSetting {
  readonly value: string;
  readonly settingLabel?: string;
  readonly controlNames?: readonly string[];
  readonly machineOrManual?: string;
  readonly manualNumber?: string;
}

export type StagedProvenance = Omit<Provenance, 'verified'> & {
  readonly verified: false;
};

export type StagedRecordDraft<R extends WeldingRecordSource> = R extends WeldingRecordSource
  ? Omit<R, 'provenance'> & { readonly provenance: StagedProvenance }
  : never;

export interface StagedWeldingRecord<R extends WeldingRecordSource> {
  readonly draft: StagedRecordDraft<R>;
  readonly sourceDatasetId: string;
  readonly sourceOverride?: VerifiedRecordSourceOverride;
  readonly reviewStatus: StagedReviewStatus;
  readonly reviewerNotes: string;
  readonly validationErrors: readonly string[];
  readonly readyForVerification: boolean;
  readonly sourceClassification?: SourceClassification;
}
