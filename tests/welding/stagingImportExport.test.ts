import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { exportStagedCsv, importStagedCsv, stagedCsvTemplate } from '../../src/features/welding/data/staging/importExport/csv';
import { exportStagedJson, importStagedJson } from '../../src/features/welding/data/staging/importExport/json';
import { ENTRY_COLUMNS, importEntryRows, refreshStagingRows } from '../../src/features/welding/data/staging/importExport/types';
import { emptyGmawEntryForm } from '../../src/features/welding/data/staging/gmawEntry';
import { gmawSource } from './fixtures';

function fixtureEntry() {
  const source = gmawSource();
  return {
    ...emptyGmawEntryForm(),
    recordId: source.id,
    material: source.material,
    thicknessMin: String(source.thickness.min),
    thicknessMax: String(source.thickness.max),
    thicknessUnit: source.thickness.unit,
    joints: ['butt', 'lap'],
    positions: ['flat', 'horizontal'],
    wireClass: source.wireClass,
    wireDiameter: String(source.wireDiameter.value),
    wireDiameterUnit: source.wireDiameter.unit,
    gas: source.gas,
    transferMode: source.transferMode,
    polarity: source.polarity,
    voltageMin: String(source.voltage.min),
    voltageMax: String(source.voltage.max),
    wireFeedMin: String(source.wireFeed.min),
    wireFeedMax: String(source.wireFeed.max),
    wireFeedUnit: source.wireFeed.unit,
    sourceDatasetId: 'fictional-staging-file',
    publisher: source.provenance.source.publisher,
    document: source.provenance.source.document,
    reviewerNotes: 'Fictional, "quoted" notes\nSecond line',
  };
}

function fixtureRows() {
  const entry = fixtureEntry();
  return importEntryRows([{ entry, raw: entry }]).rows;
}

describe('developer staging import/export', () => {
  it('round-trips CSV with quotes, commas, multiline notes, lists and exact unit strings', () => {
    const rows = fixtureRows();
    const imported = importStagedCsv(exportStagedCsv(rows));
    expect(imported.summary.validRows).toBe(1);
    expect(imported.rows[0]?.entry).toEqual(rows[0]?.entry);
    expect(imported.rows[0]?.raw).toEqual(rows[0]?.raw);
    expect(imported.rows[0]?.staged?.draft.wireFeed).toEqual(gmawSource().wireFeed);
  });

  it('round-trips JSON and keeps provenance unverified', () => {
    const rows = fixtureRows();
    const imported = importStagedJson(exportStagedJson(rows));
    expect(imported.rows[0]?.entry).toEqual(rows[0]?.entry);
    expect(imported.rows[0]?.raw).toEqual(rows[0]?.raw);
    expect(imported.rows[0]?.staged?.draft.provenance.verified).toBe(false);
  });

  it('leaves blank optional amperage and gas flow undefined in both formats', () => {
    for (const result of [importStagedCsv(exportStagedCsv(fixtureRows())), importStagedJson(exportStagedJson(fixtureRows()))]) {
      expect(result.rows[0]?.staged?.draft.amperage).toBeUndefined();
      expect(result.rows[0]?.staged?.draft.gasFlow).toBeUndefined();
    }
  });

  it('preserves optional ranges when supplied and rejects gas flow without a unit', () => {
    const source = gmawSource();
    const entry = {
      ...fixtureEntry(),
      amperageMin: String(source.amperage!.min),
      amperageMax: String(source.amperage!.max),
      gasFlowMin: String(source.gasFlow!.min),
      gasFlowMax: String(source.gasFlow!.max),
      gasFlowUnit: source.gasFlow!.unit,
    };
    const result = importStagedJson(JSON.stringify([entry]));
    const roundTrip = importStagedCsv(exportStagedCsv(result.rows));
    expect(roundTrip.rows[0]?.staged?.draft.amperage).toEqual(source.amperage);
    expect(roundTrip.rows[0]?.staged?.draft.gasFlow).toEqual(source.gasFlow);
    const missingUnit = importStagedJson(JSON.stringify([{ ...entry, gasFlowUnit: '' }]));
    expect(missingUnit.rows[0]?.validationErrors.join(' ')).toContain('gasFlowUnit');
    expect(missingUnit.rows[0]?.staged).toBeNull();
  });

  it('retains missing required units as errors without substituting units', () => {
    const entry = { ...fixtureEntry(), thicknessUnit: '' };
    for (const result of [importStagedJson(JSON.stringify([entry])), importStagedCsv(exportStagedCsv(importEntryRows([{ entry, raw: entry }]).rows))]) {
      expect(result.rows).toHaveLength(1);
      expect(result.summary.rowsWithErrors).toBe(1);
      expect(result.rows[0]?.entry.thicknessUnit).toBe('');
      expect(result.rows[0]?.validationErrors.join(' ')).toContain('thicknessUnit');
      expect(result.rows[0]?.staged).toBeNull();
    }
  });

  it('retains malformed CSV rows including unexpected extra cells', () => {
    const result = importStagedCsv('recordId,wireClass\ninvalid-row,WIRE-X,unexpected');
    expect(result.summary.rowsImported).toBe(1);
    expect(result.summary.rowsWithErrors).toBe(1);
    expect(result.summary.skippedRows).toBe(0);
    expect(result.rows[0]?.validationErrors.join(' ')).toContain('3 cells');
    expect(result.rows[0]?.raw).toEqual({ headers: ['recordId', 'wireClass'], cells: ['invalid-row', 'WIRE-X', 'unexpected'] });
    expect(importStagedJson(exportStagedJson(result.rows)).rows[0]?.raw).toEqual(result.rows[0]?.raw);
  });

  it('retains malformed JSON and malformed rows for correction/export', () => {
    const result = importStagedJson('{broken');
    expect(result.summary.rowsWithErrors).toBe(1);
    expect(result.rows[0]?.raw).toBe('{broken');
    expect(result.rows[0]?.reviewStatus).toBe('draft');
    const mixed = importStagedJson(JSON.stringify([fixtureEntry(), null]));
    expect(mixed.summary).toEqual({ rowsImported: 2, validRows: 1, rowsWithErrors: 1, skippedRows: 0 });
  });

  it('reports every duplicate ID in the imported file and retains all rows', () => {
    const entry = fixtureEntry();
    const result = importStagedJson(JSON.stringify([entry, entry]));
    expect(result.rows).toHaveLength(2);
    expect(result.summary.validRows).toBe(0);
    expect(result.rows.every((row) => row.validationErrors.some((error) => error.includes('Duplicate record ID')))).toBe(true);
  });

  it('reports CSV IDs that collide with existing staging without overwriting them', () => {
    const existing = fixtureRows();
    const snapshot = structuredClone(existing);
    const result = importStagedCsv(exportStagedCsv(fixtureRows()), existing);
    expect(result.rows[0]?.validationErrors.join(' ')).toContain('Duplicate record ID');
    expect(existing).toEqual(snapshot);
  });

  it('parses semicolon lists without inventing applicability', () => {
    const entry = { ...fixtureEntry(), joints: 'butt;lap', positions: 'flat;horizontal' };
    const result = importStagedJson(JSON.stringify([entry]));
    expect(result.rows[0]?.entry.joints).toEqual(['butt', 'lap']);
    expect(result.rows[0]?.entry.positions).toEqual(['flat', 'horizontal']);
    expect(result.summary.validRows).toBe(1);
  });

  it('exports a headers-only CSV template with no values', () => {
    const template = stagedCsvTemplate();
    expect(Papa.parse<string[]>(template).data).toEqual([[...ENTRY_COLUMNS]]);
    expect(importStagedCsv(template).summary.rowsImported).toBe(0);
  });

  it('ignores imported verified and ready statuses and recomputes validation', () => {
    const row = fixtureRows()[0]!;
    const text = exportStagedJson([row]);
    const tampered = JSON.parse(text);
    tampered.rows[0].reviewStatus = 'ready';
    tampered.rows[0].readyForVerification = true;
    tampered.rows[0].staged.draft.provenance.verified = true;
    const imported = importStagedJson(JSON.stringify(tampered));
    expect(imported.rows[0]?.reviewStatus).toBe('draft');
    expect(imported.rows[0]?.readyForVerification).toBe(false);
    expect(imported.rows[0]?.staged?.readyForVerification).toBe(false);
    expect(imported.rows[0]?.staged?.draft.provenance.verified).toBe(false);
  });

  it('blocks CSV formula cells rather than silently altering their values', () => {
    const entry = { ...fixtureEntry(), reviewerNotes: '=untrusted()' };
    const rows = importEntryRows([{ entry, raw: entry }]).rows;
    expect(() => exportStagedCsv(rows)).toThrow(/spreadsheet formula/);
    expect(importStagedJson(exportStagedJson(rows)).rows[0]?.entry.reviewerNotes).toBe('=untrusted()');
  });

  it('retains an empty comma-delimited bad row while reporting actual blank lines as skipped', () => {
    const result = importStagedCsv('recordId,wireClass\n,\n');
    expect(result.summary.rowsImported).toBe(1);
    expect(result.summary.rowsWithErrors).toBe(1);
    expect(result.summary.skippedRows).toBe(1);
  });

  it('reports malformed CSV quoting without discarding the row', () => {
    const result = importStagedCsv('recordId,wireClass\n"unclosed quote');
    expect(result.summary.rowsImported).toBe(1);
    expect(result.rows[0]?.validationErrors.join(' ')).toContain('CSV');
    expect(result.rows[0]?.raw).toBeDefined();
  });

  it('refreshes duplicate warnings on both incoming and existing session rows', () => {
    const original = fixtureRows()[0]!;
    const refreshed = refreshStagingRows([{ ...original, reviewStatus: 'needs-review' }, original]);
    expect(refreshed).toHaveLength(2);
    expect(refreshed.every((row) => row.validationErrors.some((error) => error.includes('Duplicate record ID')))).toBe(true);
    expect(refreshed.every((row) => row.reviewStatus === 'draft')).toBe(true);
  });

  it('retains a review request only when session validation passes', () => {
    const original = fixtureRows()[0]!;
    const refreshed = refreshStagingRows([{ ...original, reviewStatus: 'needs-review' }]);
    expect(refreshed[0]?.reviewStatus).toBe('needs-review');
    expect(refreshed[0]?.staged?.draft.provenance.verified).toBe(false);
    expect(refreshed[0]?.readyForVerification).toBe(false);
  });
});