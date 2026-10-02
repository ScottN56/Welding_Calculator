import type { FcawRecordSource } from '../../types';
import {
  recordsFromDatasets,
  type VerifiedDataset,
} from '../datasets';

/**
 * Verified FCAW reference datasets will be added here later.
 *
 * Do not add sample or unverified welding values here.
 */
export const fcawVerifiedDatasets:
  readonly VerifiedDataset<FcawRecordSource>[] = [];

/**
 * Production FCAW records.
 *
 * This remains empty until verified source data is added.
 */
export const fcawRecords:
  readonly FcawRecordSource[] =
    recordsFromDatasets(fcawVerifiedDatasets);
