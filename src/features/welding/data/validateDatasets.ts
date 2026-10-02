import type { InterpolationPolicy, SourceReference, WeldingRecordSource } from '../types';
import type { VerifiedDataset } from './datasets';

const SHARED_SOURCE_FIELDS: readonly (keyof SourceReference)[] = [
  'publisher',
  'document',
  'edition',
  'publicationDate',
  'url',
  'accessedDate',
  'notes',
];

function isInterpolationPolicy(value: unknown): value is InterpolationPolicy {
  return value === 'prohibited' || value === 'linear';
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Validates dataset metadata, provenance and cross-dataset identities without inspecting welding values. */
export function validateVerifiedDatasets(
  datasets: readonly VerifiedDataset<WeldingRecordSource>[],
): string[] {
  const errors: string[] = [];
  const datasetIds = new Set<string>();
  const recordIds = new Set<string>();

  for (const dataset of datasets) {
    const { metadata } = dataset;
    const datasetLabel = metadata.id.trim() || '<empty dataset id>';

    if (dataset.classification !== 'generic-recommendation') {
      errors.push(`[${datasetLabel}] generic registry only accepts generic-recommendation datasets`);
    }

    if (!metadata.id.trim()) errors.push('[dataset] id is required');
    if (datasetIds.has(metadata.id)) errors.push(`[${datasetLabel}] duplicate dataset id`);
    datasetIds.add(metadata.id);

    if (!metadata.source.publisher.trim()) errors.push(`[${datasetLabel}] publisher is required`);
    if (!metadata.source.document.trim()) errors.push(`[${datasetLabel}] document title is required`);
    if (!metadata.verifiedBy.trim()) errors.push(`[${datasetLabel}] verifiedBy is required`);
    if (!isValidDate(metadata.verifiedDate)) {
      errors.push(`[${datasetLabel}] verifiedDate must use YYYY-MM-DD`);
    }
    for (const [field, value] of [
      ['publicationDate', metadata.source.publicationDate],
      ['accessedDate', metadata.source.accessedDate],
    ] as const) {
      if (value !== undefined && !isValidDate(value)) {
        errors.push(`[${datasetLabel}] source ${field} must use YYYY-MM-DD`);
      }
    }
    if (metadata.source.url !== undefined && !isValidSourceUrl(metadata.source.url)) {
      errors.push(`[${datasetLabel}] source URL is invalid`);
    }
    if (
      metadata.interpolationDefault !== undefined &&
      !isInterpolationPolicy(metadata.interpolationDefault)
    ) {
      errors.push(`[${datasetLabel}] interpolationDefault is invalid`);
    }

    for (const record of dataset.records) {
      const recordLabel = record.id.trim() || '<empty record id>';
      if (!record.id.trim()) errors.push(`[${datasetLabel}] record id is required`);
      if (recordIds.has(record.id)) errors.push(`[${datasetLabel}] duplicate record id: ${recordLabel}`);
      recordIds.add(record.id);

      if (record.process !== metadata.process) {
        errors.push(`[${datasetLabel}] record ${recordLabel} process does not match dataset process`);
      }
      if (!record.provenance.verified) {
        errors.push(`[${datasetLabel}] record ${recordLabel} is not verified`);
      }

      for (const field of SHARED_SOURCE_FIELDS) {
        if ((record.provenance.source[field] ?? undefined) !== (metadata.source[field] ?? undefined)) {
          errors.push(`[${datasetLabel}] record ${recordLabel} provenance source ${field} does not match dataset source`);
        }
      }
      if (record.provenance.verifiedBy !== metadata.verifiedBy) {
        errors.push(`[${datasetLabel}] record ${recordLabel} verifiedBy does not match dataset metadata`);
      }
      if (record.provenance.verifiedDate !== metadata.verifiedDate) {
        errors.push(`[${datasetLabel}] record ${recordLabel} verifiedDate does not match dataset metadata`);
      }
      if (record.interpolation !== undefined && !isInterpolationPolicy(record.interpolation)) {
        errors.push(`[${datasetLabel}] record ${recordLabel} interpolation policy is invalid`);
      }
    }
  }

  return errors;
}
