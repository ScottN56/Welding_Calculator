import type { GtawRecordSource } from '../../types';

import {
  recordsFromDatasets,
  type VerifiedDataset,
} from '../datasets';

/**
 * Verified GTAW reference datasets will be added here later.
 *
 * Do not add sample or unverified welding values here.
 */
export const gtawVerifiedDatasets:
  readonly VerifiedDataset<GtawRecordSource>[] = [];

/**
 * Production GTAW records.
 *
 * This remains empty until verified source data is added.
 */
export const gtawRecords:
  readonly GtawRecordSource[] =
    recordsFromDatasets(gtawVerifiedDatasets);
