import { describe, expect, it } from 'vitest';
import { emptyGmawEntryForm } from '../src/features/welding/data/staging/gmawEntry';
import {
  compareImportBatches,
  createImportBatch,
  deleteStagedImportBatch,
  exportImportBatchCsv,
  exportImportBatchJson,
  type ImportBatch,
} from '../src/features/welding/data/staging/importBatch';
import { importEntryRows, STAGING_FILE_FORMAT, STAGING_FILE_VERSION, type StagingImportRow } from '../src/features/welding/data/staging/importExport/types';
import { exportStagedCsv, importStagedCsv } from '../src/features/welding/data/staging/importExport/csv';
import { exportStagedJson, importStagedJson } from '../src/features/welding/data/staging/importExport/json';

interface FictionalSourceRow {
  readonly recordId: string;
  readonly rowNumber: number;
  readonly values: readonly string[];
  readonly units: readonly string[];
}

function stagingRows(sourceRows: readonly FictionalSourceRow[]): StagingImportRow[] {
  return sourceRows.map((sourceRow) => {
    const entry = emptyGmawEntryForm();
    entry.recordId = sourceRow.recordId;
    entry.document = 'Fictional chart';
    entry.tableOrChart = 'APPLICATION CHART';
    const imported = importEntryRows([{
      entry,
      batchId: 'fictional-batch',
      raw: { verified: false, publishedRow: {
        pageNumber: 1, tableIdentifier: 'application-chart-1', tableTitle: 'APPLICATION CHART',
        rowNumber: sourceRow.rowNumber, cells: sourceRow.values, headers: sourceRow.units,
      } },
    }]).rows[0];
    if (!imported) throw new Error('Fixture row failed to build.');
    return imported;
  });
}

function buildBatch(sourceRows: readonly FictionalSourceRow[], sourceHash = 'a'.repeat(64)): ImportBatch {
  return createImportBatch({
    sourceId: 'fictional-official-source', manufacturer: 'Lincoln Electric', sourceUrl: 'https://ch-delivery.lincolnelectric.com/fictional.pdf',
    documentTitle: 'Fictional operator manual', localFileName: 'fictional.pdf', sourceHash,
    parserName: 'fictional-parser', parserVersion: '1.0.0', importTimestamp: '2026-10-02T12:00:00.000Z',
    dryRun: false, rowsAcceptedIntoStaging: sourceRows.length, stagingRows: stagingRows(sourceRows), sourceChanged: false,
  });
}

describe('developer import batches', () => {
  it('creates deterministic IDs from source identity, snapshot hash and import metadata, not parameter values', () => {
    const first = buildBatch([{ recordId: 'one', rowNumber: 1, values: ['25.4'], units: ['mm'] }]);
    const differentValues = buildBatch([{ recordId: 'two', rowNumber: 1, values: ['1'], units: ['in'] }]);
    expect(first.batchId).toBe(differentValues.batchId);
    expect(first.sourceHash).toBe('a'.repeat(64));
    expect(first.rows[0]?.sourceValues).toMatchObject({ cells: ['25.4'], headers: ['mm'] });
  });

  it('compares exact source identities and values to detect added, removed, changed and unchanged rows', () => {
    const previous = buildBatch([
      { recordId: 'one', rowNumber: 1, values: ['0.9'], units: ['mm'] },
      { recordId: 'two', rowNumber: 2, values: ['2.0'], units: ['mm'] },
      { recordId: 'three', rowNumber: 3, values: ['25.4'], units: ['mm'] },
    ]);
    const next = buildBatch([
      { recordId: 'one-new', rowNumber: 1, values: ['0.9'], units: ['mm'] },
      { recordId: 'three-new', rowNumber: 3, values: ['1'], units: ['in'] },
      { recordId: 'four', rowNumber: 4, values: ['3.2'], units: ['mm'] },
    ], 'b'.repeat(64));
    const comparison = compareImportBatches(previous, next);
    expect(comparison.added.map((row) => row.sourceRecordIdentity)).toEqual(['1|application-chart-1|4']);
    expect(comparison.removed.map((row) => row.sourceRecordIdentity)).toEqual(['1|application-chart-1|2']);
    expect(comparison.changed).toHaveLength(1);
    expect(comparison.changed[0]?.before.sourceValues).toMatchObject({ cells: ['25.4'], headers: ['mm'] });
    expect(comparison.changed[0]?.after.sourceValues).toMatchObject({ cells: ['1'], headers: ['in'] });
    expect(comparison.unchanged).toHaveLength(1);
  });

  it('does not normalize source units during comparison', () => {
    const millimeters = buildBatch([{ recordId: 'wire', rowNumber: 1, values: ['25.4'], units: ['mm'] }]);
    const inches = buildBatch([{ recordId: 'wire-new', rowNumber: 1, values: ['1'], units: ['in'] }], 'b'.repeat(64));
    expect(compareImportBatches(millimeters, inches).changed).toHaveLength(1);
    expect(compareImportBatches(millimeters, inches).unchanged).toHaveLength(0);
  });

  it('exports exact source values and unit strings in JSON and CSV', () => {
    const batch = buildBatch([{ recordId: 'wire', rowNumber: 1, values: ['25.4'], units: ['mm'] }]);
    const json = JSON.parse(exportImportBatchJson(batch)) as { batch: ImportBatch };
    expect(json.batch.rows[0]?.sourceValues).toMatchObject({ cells: ['25.4'], headers: ['mm'] });
    const csv = exportImportBatchCsv(batch);
    expect(csv).toContain('25.4');
    expect(csv).toContain('mm');
  });

  it('preserves the originating batch ID when staged rows round-trip through JSON and CSV', () => {
    const row = stagingRows([{ recordId: 'linked-row', rowNumber: 1, values: ['25.4'], units: ['mm'] }])[0]!;
    for (const imported of [
      importStagedJson(exportStagedJson([row])).rows[0],
      importStagedCsv(exportStagedCsv([row])).rows[0],
    ]) expect(imported?.batchId).toBe('fictional-batch');
  });

  it('deletes only the selected staging batch and its rows while preserving verified-data fields and history', () => {
    const first = buildBatch([{ recordId: 'one', rowNumber: 1, values: ['25.4'], units: ['mm'] }]);
    const second = { ...first, batchId: 'second-batch', rows: first.rows.map((row) => ({ ...row, recordId: 'two' })) };
    const document = JSON.stringify({
      format: STAGING_FILE_FORMAT, version: STAGING_FILE_VERSION,
      rows: [{ entry: { recordId: 'one' }, raw: {}, batchId: first.batchId }, { entry: { recordId: 'two' }, raw: {}, batchId: second.batchId }],
      sources: [{ sourceUrl: 'https://ch-delivery.lincolnelectric.com/fictional.pdf' }],
      batches: [first, second], verifiedProductionRecords: [{ id: 'committed-record' }],
    });
    const deleted = JSON.parse(deleteStagedImportBatch(document, first.batchId)) as {
      rows: { batchId: string }[]; batches: ImportBatch[]; verifiedProductionRecords: { id: string }[]; sources: unknown[];
    };
    expect(deleted.rows.map((row) => row.batchId)).toEqual(['second-batch']);
    expect(deleted.batches.map((batch) => batch.batchId)).toEqual(['second-batch']);
    expect(deleted.verifiedProductionRecords).toEqual([{ id: 'committed-record' }]);
    expect(deleted.sources).toHaveLength(1);
  });
});