import type { GmawRecordSource } from '../../types';
import { recordsFromDatasets, type VerifiedDataset } from '../datasets';

/**
 * VERIFIED GMAW reference datasets go here.
 *
 * Add one dataset per documented source (manufacturer chart, consumable data sheet,
 * approved procedure reference, etc.). Use defineVerifiedDataset(...) in a dedicated
 * source file, then import that dataset here.
 *
 * Do not add sample/unverified values to this array.
 */
export const gmawVerifiedDatasets: readonly VerifiedDataset<GmawRecordSource>[] = [];

/**
 * Flattened production GMAW records consumed by the registry.
 * Intentionally empty until verified datasets are supplied.
 */
export const gmawRecords: readonly GmawRecordSource[] = recordsFromDatasets(gmawVerifiedDatasets);
