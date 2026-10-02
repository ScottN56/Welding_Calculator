import { defineVerifiedDataset } from '../datasets';
import type {
  SmawRecordSource,
} from '../../types';

/**

 * TEMPLATE ONLY.
 *
 * Copy this file later when adding real,
 * verified SMAW manufacturer data.
 *
 * Do not import this template into smaw.ts.
 */
export const smawTemplateDataset =
  defineVerifiedDataset<SmawRecordSource>(
    {

      id: 'replace-with-smaw-dataset-id',
      process: 'SMAW',
      source: {
        publisher: 'Replace with manufacturer',
        document: 'Replace with document title',
      },
      verifiedBy: 'Replace with reviewer',
      verifiedDate: '2026-10-02',
    },
    [],
  );
