import { defineVerifiedDataset } from '../datasets';
import type {
  GtawRecordSource,
} from '../../types';

/**

 * TEMPLATE ONLY.
 *
 * Copy this file later when adding real,
 * verified GTAW manufacturer data.
 *
 * Do not import this template into gtaw.ts.
 */
export const gtawTemplateDataset =
  defineVerifiedDataset<GtawRecordSource>(
    {

      id: 'replace-with-gtaw-dataset-id',
      process: 'GTAW',
      source: {
        publisher: 'Replace with manufacturer',
        document: 'Replace with document title',
      },
      verifiedBy: 'Replace with reviewer',
      verifiedDate: '2026-10-02',
    },
    [],
  );
