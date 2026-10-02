import { useId, useRef, useState, type FormEvent } from 'react';
import { PageHeader } from '../components/PageHeader';
import { NoticeBanner } from '../components/NoticeBanner';
import {
  GMAW_ENTRY_FIELDS,
  emptyGmawEntryForm,
  type GmawEntryForm,
  type GmawEntryResult,
} from '../features/welding/data/staging/gmawEntry';
import { exportStagedCsv, importStagedCsv, stagedCsvTemplate } from '../features/welding/data/staging/importExport/csv';
import { exportStagedJson, importStagedJson } from '../features/welding/data/staging/importExport/json';
import { importEntryRows, isObject, refreshStagingRows, type StagingImportRow, type StagingImportSummary } from '../features/welding/data/staging/importExport/types';
import { readScanDashboardSummary, type ScanDashboardSummary } from '../features/welding/data/staging/importExport/scanSummary';
import { JOINT_TYPES, WELD_POSITIONS } from '../features/welding/types';
import { GAS_LABELS, JOINT_LABELS, MATERIAL_LABELS, POSITION_LABELS, TRANSFER_MODE_LABELS } from '../features/welding/data/catalog';
import styles from './DeveloperDataEntryPage.module.css';

const OPTION_LABELS: Readonly<Record<string, string>> = {
  ...GAS_LABELS,
  ...MATERIAL_LABELS,
  ...TRANSFER_MODE_LABELS,
  in: 'inches (in)',
  mm: 'millimeters (mm)',
  ipm: 'inches/min (IPM)',
  'mm/min': 'mm/min',
  'm/min': 'm/min',
  cfh: 'CFH',
  lpm: 'L/min',
};

function machineSourceDetails(raw: unknown): readonly { readonly label: string; readonly value: string }[] {
  if (!isObject(raw) || !isObject(raw.publishedRow)) return [];
  const published = raw.publishedRow;
  const context = isObject(published.context)
    ? Object.entries(published.context).flatMap(([label, value]) => typeof value === 'string' ? [{ label, value }] : [])
    : [];
  const headers = Array.isArray(published.headers) ? published.headers : [];
  const cells = Array.isArray(published.cells) ? published.cells : [];
  const columns = headers.flatMap((header, index) => typeof header === 'string' && typeof cells[index] === 'string' && cells[index]
    ? [{ label: header, value: cells[index] as string }]
    : []);
  return [...context, ...columns];
}

export default function DeveloperDataEntryPage({ initialRows = [] }: { readonly initialRows?: readonly StagingImportRow[] }) {
  const id = useId();
  const [form, setForm] = useState(emptyGmawEntryForm);
  const [result, setResult] = useState<GmawEntryResult | null>(null);
  const [rows, setRows] = useState<readonly StagingImportRow[]>(initialRows);
  const rowsRef = useRef<readonly StagingImportRow[]>(initialRows);
  const [summary, setSummary] = useState<StagingImportSummary | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [scanDashboard, setScanDashboard] = useState<ScanDashboardSummary | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);

  const updateRows = (next: readonly StagingImportRow[]) => {
    const refreshed = refreshStagingRows(next);
    rowsRef.current = refreshed;
    setRows(refreshed);
  };

  const update = <K extends keyof GmawEntryForm>(key: K, value: GmawEntryForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setResult(null);
  };
  const validate = (event: FormEvent) => {
    event.preventDefault();
    saveEntry(false);
  };

  const saveEntry = (forReview: boolean) => {
    const existing = rows.filter((_, index) => index !== editingIndex);
    const raw = editingIndex === null ? form : rows[editingIndex]?.raw ?? form;
    const manufacturerMachineSetting = editingIndex === null ? undefined : rows[editingIndex]?.manufacturerMachineSetting;
    const sourceClassification = editingIndex === null ? undefined : rows[editingIndex]?.sourceClassification;
    const batchId = editingIndex === null ? undefined : rows[editingIndex]?.batchId;
    const imported = importEntryRows([{
      entry: form, raw,
      ...(batchId === undefined ? {} : { batchId }),
      ...(manufacturerMachineSetting === undefined ? {} : { manufacturerMachineSetting }),
      ...(sourceClassification === undefined ? {} : { sourceClassification }),
    }], existing);
    const row = imported.rows[0];
    if (!row) return;
    const reviewStatus = forReview && row.validationErrors.length === 0 ? 'needs-review' : 'draft';
    const next: StagingImportRow = {
      ...row,
      reviewStatus,
      staged: row.staged ? { ...row.staged, reviewStatus } : null,
    };
    updateRows(editingIndex === null ? [...rows, next] : rows.map((current, index) => index === editingIndex ? next : current));
    if (editingIndex === null) setEditingIndex(rows.length);
    setResult(next.validationErrors.length || !next.staged
      ? { ok: false, errors: next.validationErrors }
      : { ok: true, staged: next.staged });
  };

  const importFile = async (file: File | undefined, format: 'csv' | 'json') => {
    if (!file) return;
    setTransferError(null);
    try {
      const text = await file.text();
      const currentRows = rowsRef.current;
      const imported = format === 'csv' ? importStagedCsv(text, currentRows) : importStagedJson(text, currentRows);
      updateRows([...currentRows, ...imported.rows]);
      setSummary(imported.summary);
      if (format === 'json') {
        const dashboard = readScanDashboardSummary(text);
        if (dashboard) setScanDashboard(dashboard);
      }
      setResult(null);
    } catch (error) {
      setTransferError(`Import failed for ${file.name}: ${error instanceof Error ? error.message : String(error)}. No rows were replaced.`);
    }
  };

  const download = (format: 'csv' | 'json' | 'template') => {
    setTransferError(null);
    try {
      const text = format === 'template' ? stagedCsvTemplate() : format === 'csv' ? exportStagedCsv(rows) : exportStagedJson(rows);
      const isJson = format === 'json';
      const url = URL.createObjectURL(new Blob([text], { type: isJson ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = format === 'template' ? 'staged-gmaw-template.csv' : `staged-gmaw.${format}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setTransferError(error instanceof Error ? error.message : 'Export failed.');
    }
  };

  if (!import.meta.env.DEV) return null;

  return (
    <div className="page">
      <PageHeader title="Data Entry" subtitle="Developer staged GMAW entry" />
      <NoticeBanner tone="warning" title="Unverified staging only">
        <p>Copy exact source values and select source units. Missing optional values must remain blank.</p>
        <p>Drafts stay in memory only. Nothing here verifies, promotes, or adds data to the calculator.</p>
      </NoticeBanner>

      {scanDashboard && (
        <section aria-labelledby={`${id}-scan`}>
          <h2 id={`${id}-scan`} className="card__title">Developer scan summary</h2>
          <p className="muted small">Last scan report from the imported staging file. No scan runs in this browser.</p>
          <dl className="summary">
            {[
              ['Last scan time', scanDashboard.scannedAt], ['Sources scanned', scanDashboard.sourcesScanned],
              ['Changed sources', scanDashboard.changedSources], ['New staged records', scanDashboard.newStagedRecords],
              ['Records needing review', scanDashboard.recordsNeedingReview], ['Failed sources', scanDashboard.failedSources],
            ].map(([label, value]) => <div key={label} className="summary__row"><dt>{label}</dt><dd className={styles.raw}>{value}</dd></div>)}
          </dl>
        </section>
      )}

      <section aria-labelledby={`${id}-transfer`} className={styles.form}>
        <h2 id={`${id}-transfer`} className="card__title">Staged file import / export</h2>
        <p className="muted small">CSV uses the template field names; joints and positions use semicolons, for example flat;horizontal. JSON uses the exported versioned format or an array of entry objects. Imports always start as unverified drafts. Blank optional values stay missing; source units must be explicit.</p>
        <input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={(event) => {
          void importFile(event.target.files?.[0], 'csv');
          event.target.value = '';
        }} />
        <input ref={jsonInput} type="file" accept=".json,application/json" hidden onChange={(event) => {
          void importFile(event.target.files?.[0], 'json');
          event.target.value = '';
        }} />
        <div className={styles.actions}>
          <button type="button" className="button button--secondary" onClick={() => csvInput.current?.click()}>Import CSV</button>
          <button type="button" className="button button--secondary" onClick={() => jsonInput.current?.click()}>Import JSON</button>
          <button type="button" className="button button--secondary" disabled={rows.length === 0} onClick={() => download('csv')}>Export CSV</button>
          <button type="button" className="button button--secondary" disabled={rows.length === 0} onClick={() => download('json')}>Export JSON</button>
          <button type="button" className="button button--secondary" onClick={() => download('template')}>Download CSV Template</button>
        </div>
        {summary && <p role="status">Rows imported: {summary.rowsImported}. Valid rows: {summary.validRows}. Rows with errors: {summary.rowsWithErrors}. Skipped rows: {summary.skippedRows} (empty lines only).</p>}
        {transferError && <NoticeBanner tone="danger" role="alert">{transferError}</NoticeBanner>}
        <h3>Session staging: {rows.length} rows</h3>
        {rows.length > 0 && (
          <ol className={styles.rows}>
            {rows.map((row, index) => (
              <li key={index} className={styles.row}>
                <strong>{row.entry.recordId || `Missing ID (row ${index + 1})`}</strong>
                <span>Unverified · {row.reviewStatus} · {row.validationErrors.length ? 'Has errors' : 'Validation passed'}</span>
                {row.sourceClassification && <p>Source classification: {row.sourceClassification}</p>}
                {row.datasetClassification && <p className="badge badge--warn">{row.datasetClassification}</p>}
                {row.manufacturerMachineSetting && (
                  <section aria-label="Machine-specific source setting">
                    <span className="badge badge--warn">Machine-specific</span>
                    <p>Manufacturer: {row.entry.publisher || 'Not identified'}</p>
                    <p>Machine/profile: {row.manufacturerMachineSetting.machineOrManual ?? 'Not identified in the supplied source; do not assume a model.'}</p>
                    <p>Manual: {(row.manufacturerMachineSetting.manualNumber ?? row.entry.document) || 'Not identified'}</p>
                    <p>{row.manufacturerMachineSetting.settingLabel ?? 'Published control'}: <code>{row.manufacturerMachineSetting.value}</code>. Not a generic welding parameter.</p>
                    {machineSourceDetails(row.raw).length > 0 && <dl className="summary">
                      {machineSourceDetails(row.raw).map((field, fieldIndex) => <div key={`${field.label}-${fieldIndex}`} className="summary__row"><dt>{field.label}</dt><dd>{field.value}</dd></div>)}
                    </dl>}
                  </section>
                )}
                {row.validationErrors.length > 0 && <ul>{row.validationErrors.map((error, errorIndex) => <li key={errorIndex}>{error}</li>)}</ul>}
                <details><summary>Original imported data</summary><pre className={styles.raw}>{JSON.stringify(row.raw, null, 2)}</pre></details>
                <button type="button" className="button button--secondary" onClick={() => {
                  setForm(structuredClone(row.entry));
                  setEditingIndex(index);
                  setResult(null);
                }}>Edit row {index + 1}</button>
              </li>
            ))}
          </ol>
        )}
        <button type="button" className="button button--secondary" onClick={() => {
          setForm(emptyGmawEntryForm());
          setEditingIndex(null);
          setResult(null);
        }}>New blank record</button>
      </section>

      <form onSubmit={validate} noValidate className={styles.form}>
        <h2 className="card__title">{editingIndex === null ? 'New record' : `Editing staged row ${editingIndex + 1}`}</h2>
        <div className={styles.fields}>
          {GMAW_ENTRY_FIELDS.map((field) => {
            const [key, label] = field;
            const options = field.length === 3 ? field[2] : undefined;
            const fieldId = `${id}-${key}`;
            return (
              <div key={key} className="field">
                <label htmlFor={fieldId} className="field__label">{label}</label>
                {options ? (
                  <select id={fieldId} className="select" value={form[key]} onChange={(event) => update(key, event.target.value)}>
                    <option value="">Select from source</option>
                    {options.map((value) => (
                      <option key={value} value={value}>{OPTION_LABELS[value] ?? value}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={fieldId}
                    className="input"
                    type="text"
                    inputMode={/Min$|Max$|^wireDiameter$/.test(key) ? 'decimal' : 'text'}
                    autoComplete="off"
                    value={form[key]}
                    onChange={(event) => update(key, event.target.value)}
                  />
                )}
              </div>
            );
          })}
        </div>

        <fieldset className="fieldset">
          <legend className="field__label">Joint applicability</legend>
          <div className={styles.choices}>
            {JOINT_TYPES.map((joint) => (
              <label key={joint} className={styles.choice}>
                <input type="checkbox" checked={form.joints.includes(joint)} onChange={(event) => update(
                  'joints', event.target.checked ? [...form.joints, joint] : form.joints.filter((value) => value !== joint),
                )} />
                {JOINT_LABELS[joint]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="fieldset">
          <legend className="field__label">Position applicability</legend>
          <div className={styles.choices}>
            {WELD_POSITIONS.map((position) => (
              <label key={position} className={styles.choice}>
                <input type="checkbox" checked={form.positions.includes(position)} onChange={(event) => update(
                  'positions', event.target.checked ? [...form.positions, position] : form.positions.filter((value) => value !== position),
                )} />
                {POSITION_LABELS[position]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor={`${id}-notes`} className="field__label">Reviewer notes</label>
          <textarea id={`${id}-notes`} className="input textarea" rows={3} value={form.reviewerNotes} onChange={(event) => update('reviewerNotes', event.target.value)} />
        </div>

        <div className={styles.actions}>
          <button type="submit" className="button button--primary">Validate Record</button>
          <button type="button" className="button button--secondary" onClick={() => saveEntry(true)}>
            Mark Ready for Review
          </button>
        </div>
      </form>

      {result && (
        <div aria-live="polite">
          {result.ok ? (
            <NoticeBanner tone="success" title="Record validation passed">
              <p>Review status: {result.staged.reviewStatus}. Provenance remains unverified.</p>
            </NoticeBanner>
          ) : (
            <NoticeBanner tone="danger" title="Record validation errors" role="alert">
              <ul>{result.errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>
            </NoticeBanner>
          )}
        </div>
      )}
    </div>
  );
}