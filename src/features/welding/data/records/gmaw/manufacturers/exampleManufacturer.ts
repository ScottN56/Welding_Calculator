import { defineVerifiedDataset } from '../../../datasets';
import type { GmawRecordSource } from '../../../../types';

/**
 * TEMPLATE ONLY. Copy this file for a real, reviewed manufacturer document.
 * Copilot must NEVER generate welding parameter values for this template.
 * Replace every provenance placeholder from the source before adding any records.
 */
export const exampleManufacturerDataset =
  defineVerifiedDataset<GmawRecordSource>(
    {
      id: 'replace-with-dataset-id',
      process: 'GMAW',
      source: {
        publisher: 'Replace with manufacturer or publisher',
        document: 'Replace with document title',
        edition: 'Replace with edition or revision',
        publicationDate: 'YYYY-MM-DD or omit if unknown',
        page: 'Replace with page or chart reference',
        tableOrChart: 'Replace with table or chart name',
        url: 'Replace with source URL, or omit if unavailable',
        accessedDate: 'YYYY-MM-DD',
        notes: 'Optional source notes',
      },
      verifiedBy: 'Replace with reviewer',
      verifiedDate: 'YYYY-MM-DD',
      interpolationDefault: 'prohibited',
    },
    // Keep this empty; add only manually transcribed values from the cited document.
    [],
  );
