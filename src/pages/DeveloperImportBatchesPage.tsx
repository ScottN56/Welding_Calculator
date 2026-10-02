import { useRef, useState } from 'react';
import { NoticeBanner } from '../components/NoticeBanner';
import { PageHeader } from '../components/PageHeader';
import {
  compareImportBatches,
  deleteStagedImportBatch,
  exportImportBatchCsv,
  exportImportBatchJson,
  parseImportBatchDocument,
  type ImportBatch,
  type ImportBatchDocument,
  type ImportBatchRow,
} from '../features/welding/data/staging/importBatch';
import type { StagingImportRow } from '../features/welding/data/staging/importExport/types';
import styles from './DeveloperImportBatchesPage.module.css';

const GROUPS = [
  ['parsed-successfully', 'Parsed successfully'],
  ['validation-errors', 'Validation errors'],
  ['unsupported', 'Unsupported'],
  ['duplicate', 'Duplicate'],
] as const;

function download(text: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function batchLabel(batch: ImportBatch): string {
  return `${batch.manufacturer} · ${batch.documentTitle} · ${new Date(batch.importTimestamp).toLocaleString()}`;
}

function RowEvidence({ row }: { readonly row: ImportBatchRow }) {
  return (
    <li className={styles.evidence}>
      <div className={styles.evidence__heading}>
        <strong>{row.recordId || row.sourceRecordIdentity}</strong>
        <span>{row.sourceTable ?? 'Source table not identified'}{row.sourcePage ? ` · page ${row.sourcePage}` : ''}</span>
      </div>
      <dl className={styles.metrics}>
        <div><dt>Original units</dt><dd>{row.originalUnits.join(', ') || 'Not labeled'}</dd></div>
        <div><dt>Source identity</dt><dd>{row.sourceRecordIdentity}</dd></div>
      </dl>
      <details>
        <summary>Exact source values</summary>
        <pre className={styles.raw}>{JSON.stringify(row.sourceValues, null, 2)}</pre>
      </details>
      {row.parserWarnings.length > 0 && <ul className={styles.errors}>{row.parserWarnings.map((warning, index) => <li key={`${index}-${warning}`}>Parser: {warning}</li>)}</ul>}
      {row.validationErrors.length > 0 && <ul className={styles.errors}>{row.validationErrors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>}
      {row.manualReviewRequired && <span className={styles.review}>Manual review required · unverified</span>}
    </li>
  );
}

export default function DeveloperImportBatchesPage({ onOpenReviewQueue }: {
  readonly onOpenReviewQueue: (rows: readonly StagingImportRow[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [documentText, setDocumentText] = useState('');
  const [document, setDocument] = useState<ImportBatchDocument | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [compareBatchId, setCompareBatchId] = useState('');
  const [error, setError] = useState('');

  if (!import.meta.env.DEV) return null;

  const batches = [...(document?.batches ?? [])].sort((left, right) => right.importTimestamp.localeCompare(left.importTimestamp));
  const selected = batches.find((batch) => batch.batchId === selectedBatchId) ?? batches[0];
  const comparable = batches.filter((batch) => batch.sourceId === selected?.sourceId && batch.batchId !== selected.batchId);
  const compared = comparable.find((batch) => batch.batchId === compareBatchId);
  const comparison = selected && compared ? compareImportBatches(compared, selected) : null;
  const selectedRows = selected ? document?.rows.filter((row) => row.batchId === selected.batchId) ?? [] : [];

  const acceptFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      const text = await file.text();
      const loaded = parseImportBatchDocument(text);
      setDocumentText(text);
      setDocument(loaded);
      setSelectedBatchId([...loaded.batches].sort((left, right) => right.importTimestamp.localeCompare(left.importTimestamp))[0]?.batchId ?? '');
      setCompareBatchId('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to read import batches.');
    }
  };

  const deleteBatch = (batch: ImportBatch) => {
    if (!window.confirm(`Delete staged rows from batch ${batch.batchId}? This does not affect verified production data.`)) return;
    try {
      const updated = deleteStagedImportBatch(documentText, batch.batchId);
      const loaded = parseImportBatchDocument(updated);
      setDocumentText(updated);
      setDocument(loaded);
      setSelectedBatchId([...loaded.batches].sort((left, right) => right.importTimestamp.localeCompare(left.importTimestamp))[0]?.batchId ?? '');
      setCompareBatchId('');
      download(updated, 'imports.json', 'application/json;charset=utf-8');
      setError('Batch removed from the downloaded staging JSON. Replace the previous staging file with this updated file to apply the deletion on disk.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete this staged batch.');
    }
  };

  const groupedRows = (batch: ImportBatch) => GROUPS.map(([status, label]) => ({
    status, label, rows: batch.rows.filter((row) => row.status === status),
  }));

  return (
    <div className="page">
      <PageHeader title="Import Batches" subtitle="Developer source review" actions={(
        <button type="button" className="button button--secondary" onClick={() => input.current?.click()}>Load staging JSON</button>
      )} />
      <input ref={input} hidden type="file" accept=".json,application/json" onChange={(event) => {
        void acceptFile(event.target.files?.[0]);
        event.currentTarget.value = '';
      }} />
      <NoticeBanner tone="warning" title="Unverified source staging">
        <p>Batches preserve exact source values for human review. No row is verified or promoted here.</p>
        <p>Load the `.welding-source-staging/imports.json` file created by the local importer. Delete downloads an updated staging file; it never changes verified production records.</p>
      </NoticeBanner>
      {error && <NoticeBanner tone={error.startsWith('Batch removed') ? 'info' : 'danger'} role={error.startsWith('Batch removed') ? 'status' : 'alert'}>{error}</NoticeBanner>}
      {!document && <p className="muted">No staging batch document loaded.</p>}
      {document && batches.length === 0 && <p className="muted">This staging document contains no import batches.</p>}

      {batches.length > 0 && (
        <section className={styles.layout} aria-label="Import batch review">
          <div className={styles.list}>
            <h2 className="card__title">Recent batches <span className="muted">{batches.length}</span></h2>
            {batches.map((batch) => (
              <button key={batch.batchId} type="button" className={`${styles.batch} ${selected?.batchId === batch.batchId ? styles['batch--selected'] : ''}`} onClick={() => {
                setSelectedBatchId(batch.batchId);
                setCompareBatchId('');
              }}>
                <strong>{batch.manufacturer}</strong>
                <span>{batch.documentTitle}</span>
                <span>{batch.localFileName} · {new Date(batch.importTimestamp).toLocaleString()}</span>
                <span>{batch.rowsDiscovered} discovered · {batch.rowsParsed} parsed · {batch.rowsWithValidationErrors} errors</span>
                <span className={batch.sourceChanged ? styles.changed : ''}>{batch.sourceChanged ? 'Snapshot changed · compare before promotion' : `SHA-256 ${batch.sourceHash.slice(0, 12)}…`}</span>
              </button>
            ))}
          </div>

          {selected && (
            <div className={styles.detail}>
              <header className={styles.detail__header}>
                <div>
                  <h2 className="card__title">{selected.documentTitle}</h2>
                  <p className="muted">{selected.manufacturer} · {selected.sourceId} · {selected.localFileName}</p>
                </div>
                <div className={styles.actions}>
                  <button type="button" className="button button--secondary" disabled={selectedRows.length === 0} onClick={() => onOpenReviewQueue(selectedRows)}>Open in Review Queue</button>
                  <button type="button" className="button button--secondary" onClick={() => download(exportImportBatchJson(selected), `import-batch-${selected.sourceId}.json`, 'application/json;charset=utf-8')}>Export Batch JSON</button>
                  <button type="button" className="button button--secondary" onClick={() => download(exportImportBatchCsv(selected), `import-batch-${selected.sourceId}.csv`, 'text/csv;charset=utf-8')}>Export Batch CSV</button>
                  <button type="button" className="button button--secondary" onClick={() => deleteBatch(selected)}>Delete Staged Batch</button>
                </div>
              </header>

              {selected.sourceChanged && <NoticeBanner tone="danger" title="Source snapshot changed">
                <p>Source snapshot changed — compare against previously reviewed data before promotion.</p>
              </NoticeBanner>}

              <dl className={styles.summary}>
                {[
                  ['Imported', new Date(selected.importTimestamp).toLocaleString()], ['Source URL', selected.sourceUrl],
                  ['SHA-256', selected.sourceHash], ['Parser', `${selected.parserName} ${selected.parserVersion}`],
                  ['Discovered / parsed', `${selected.rowsDiscovered} / ${selected.rowsParsed}`],
                  ['Accepted into staging', selected.rowsAcceptedIntoStaging], ['Validation errors', selected.rowsWithValidationErrors],
                  ['Unsupported', selected.unsupportedRows], ['Duplicates', selected.duplicateRows],
                ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
              </dl>
              {selected.parserWarnings.length > 0 && <section>
                <h3>Parser warnings</h3>
                <ul className={styles.errors}>{selected.parserWarnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>
              </section>}

              <section className={styles.comparison}>
                <h3>Compare source snapshots</h3>
                <label className="field">
                  <span className="field__label">Earlier batch, same source</span>
                  <select className="select" value={compared?.batchId ?? ''} onChange={(event) => setCompareBatchId(event.target.value)}>
                    <option value="">Select a previous batch</option>
                    {comparable.map((batch) => <option key={batch.batchId} value={batch.batchId}>{batchLabel(batch)}</option>)}
                  </select>
                </label>
                {comparison && <div className={styles.comparison__counts}>
                  <span>Added {comparison.added.length}</span><span>Removed {comparison.removed.length}</span>
                  <span>Changed {comparison.changed.length}</span><span>Unchanged {comparison.unchanged.length}</span>
                  {[...comparison.added.map((row) => `Added · ${row.sourceRecordIdentity}`),
                    ...comparison.removed.map((row) => `Removed · ${row.sourceRecordIdentity}`),
                    ...comparison.changed.map((change) => `Changed · ${change.after.sourceRecordIdentity}`),
                  ].map((line) => <span key={line}>{line}</span>)}
                  {comparison.changed.map((change) => <pre key={change.after.sourceRecordIdentity} className={styles.raw}>{JSON.stringify({ before: change.before.sourceValues, after: change.after.sourceValues }, null, 2)}</pre>)}
                </div>}
              </section>

              <section className={styles.rows}>
                <h3>Extracted rows</h3>
                {groupedRows(selected).map((group) => (
                  <section key={group.status} className={styles.group}>
                    <h4>{group.label} <span className="muted">{group.rows.length}</span></h4>
                    {group.rows.length ? <ol>{group.rows.map((row) => <RowEvidence key={`${row.sourceRecordIdentity}-${row.recordId}`} row={row} />)}</ol> : <p className="muted">No rows.</p>}
                  </section>
                ))}
                <section className={styles.group}>
                  <h4>Manual review required <span className="muted">{selected.rows.length}</span></h4>
                  <p className="muted">All extracted source rows remain unverified and require manual review.</p>
                  {selected.rows.length > 0 && <ol>{selected.rows.map((row) => <RowEvidence key={`review-${row.sourceRecordIdentity}-${row.recordId}`} row={row} />)}</ol>}
                </section>
              </section>
            </div>
          )}
        </section>
      )}
    </div>
  );
}