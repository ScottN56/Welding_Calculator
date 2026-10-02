import type { SmawRecordSource } from '../../types';

import {
  recordsFromDatasets,
  type VerifiedDataset,
} from '../datasets';

/**
 * Verified SMAW reference datasets will be added here later.
 *
 * Do not add sample or unverified welding values here.
 */
export const smawVerifiedDatasets:
  readonly VerifiedDataset<SmawRecordSource>[] = [];

/**
 * Production SMAW records.
 *
 * This remains empty until verified source data is added.
 */
export const smawRecords:
  readonly SmawRecordSource[] =
    recordsFromDatasets(smawVerifiedDatasets);
