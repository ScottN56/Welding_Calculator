import { emptyGmawEntryForm } from '../../../src/features/welding/data/staging/gmawEntry';
import { importEntryRows, type StagingImportRow } from '../../../src/features/welding/data/staging/importExport/types';
import { hashSource } from '../hashSource';
import type { ParsedSource, SourceImportProvenance } from '../types';

export function esabRowsToStaging(
  parsed: ParsedSource,
  provenance: SourceImportProvenance,
  existing: readonly StagingImportRow[],
  batchId?: string,
) {
  const urlHash = hashSource(new TextEncoder().encode(provenance.sourceUrl)).slice(0, 16);
  return importEntryRows(parsed.rows.map((row, index) => {
    const entry = emptyGmawEntryForm();
    entry.recordId = `esab-source-${urlHash}-${provenance.sha256}-${index + 1}`;
    entry.sourceDatasetId = `esab-source-${urlHash}`;
    entry.publisher = provenance.manufacturer;
    entry.document = provenance.documentTitle;
    entry.tableOrChart = row.tableIdentifier;
    const errors = [...row.errors, 'Source-extracted only: welding process and all unpublished applicability/settings require human review. No GMAW process was inferred from this table.'];
    for (const value of row.parameters) {
      if (value.min === undefined || value.max === undefined) continue;
      switch (value.kind) {
        case 'wireDiameter':
          if (value.min !== value.max) {
            errors.push('A published diameter range cannot be replaced by a guessed single wire diameter.');
            break;
          }
          entry.wireDiameter = value.min;
          if (value.unit !== undefined) entry.wireDiameterUnit = value.unit;
          break;
        case 'wireFeed':
          entry.wireFeedMin = value.min;
          entry.wireFeedMax = value.max;
          if (value.unit !== undefined) entry.wireFeedUnit = value.unit;
          break;
        case 'voltage':
        case 'amperage': {
          const requiredUnit = value.kind === 'voltage' ? 'V' : 'A';
          if (value.unit !== requiredUnit) {
            errors.push(`${value.header}: unit cannot be represented in the ${requiredUnit} staging fields without conversion; published text retained.`);
            break;
          }
          if (value.kind === 'voltage') {
            entry.voltageMin = value.min;
            entry.voltageMax = value.max;
          } else {
            entry.amperageMin = value.min;
            entry.amperageMax = value.max;
          }
          break;
        }
      }
    }
    return {
      entry,
      raw: { origin: 'source-extracted', verified: false, provenance, publishedRow: row },
      errors,
      ...(batchId ? { batchId } : {}),
    };
  }), existing);
}