import { defineVerifiedDataset } from '../datasets';
import type { GmawRecordSource } from '../../types';

/**
 * TEMPLATE ONLY.
 *
 * Copy this file when adding a real verified GMAW source.
 *
 * Do not import this template into gmaw.ts.
 */
export const gmawTemplateDataset =
  defineVerifiedDataset<GmawRecordSource>(
    {
      id: 'replace-with-dataset-id',
      process: 'GMAW',
      source: {
        publisher: 'Replace with manufacturer',
        document: 'Replace with document title',
      },
      verifiedBy: 'Replace with reviewer',
      verifiedDate: 'YYYY-MM-DD',
    },
    [],
  );
