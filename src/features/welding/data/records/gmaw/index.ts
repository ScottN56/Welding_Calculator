import type { GmawRecordSource } from '../../../types';
import {
  recordsFromDatasets,
  type VerifiedDataset,
} from '../../datasets';

/**
 * Verified GMAW reference datasets will be added here.
 *
 * Do not put sample or unverified welding data here.
 */
export const gmawVerifiedDatasets:
  readonly VerifiedDataset<GmawRecordSource>[] = [];

/**
 * Production GMAW records used by the calculator.
 *
 * This stays empty until we add real verified source data.
 */
export const gmawRecords:
  readonly GmawRecordSource[] =
    recordsFromDatasets(gmawVerifiedDatasets);
