import { defineVerifiedDataset } from '../datasets';
import type { FcawRecordSource } from '../../types';

/**
 * TEMPLATE ONLY.
 *
 * Copy this file later when adding real,
 * verified FCAW manufacturer data.
 *
 * Do not import this template into fcaw.ts.
 */
export const fcawTemplateDataset =
  defineVerifiedDataset<FcawRecordSource>(
    {
      id: 'replace-with-fcaw-dataset-id',
      process: 'FCAW',
      source: {
        publisher: 'Replace with manufacturer',
        document: 'Replace with document title',
      },
      verifiedBy: 'Replace with reviewer',
      verifiedDate: '2026-10-02',
    },
    [],
  );
