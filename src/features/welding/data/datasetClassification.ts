export const DATASET_CLASSIFICATIONS = [
  'generic-recommendation',
  'machine-specific',
  'machine-capability',
  'consumable-reference',
] as const;

export type DatasetClassification = (typeof DATASET_CLASSIFICATIONS)[number];