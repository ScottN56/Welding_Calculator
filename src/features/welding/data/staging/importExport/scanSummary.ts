import { isObject } from './types';

export interface ScanDashboardSummary {
  readonly scannedAt: string;
  readonly sourcesScanned: number;
  readonly changedSources: number;
  readonly newStagedRecords: number;
  readonly recordsNeedingReview: number;
  readonly failedSources: number;
}

export function readScanDashboardSummary(text: string): ScanDashboardSummary | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!isObject(value) || !isObject(value.lastScan) || !isObject(value.lastScan.summary)) return null;
  const scan = value.lastScan;
  const summary = value.lastScan.summary;
  const countFields = ['sourcesChecked', 'sourcesChanged', 'rowsStaged', 'rowsRequiringReview', 'sourcesFailed'];
  if (typeof scan.scannedAt !== 'string' || !Number.isFinite(Date.parse(scan.scannedAt)) ||
    !countFields.every((key) => typeof summary[key] === 'number' && Number.isSafeInteger(summary[key]) && summary[key] >= 0)) return null;
  return {
    scannedAt: scan.scannedAt, sourcesScanned: summary.sourcesChecked as number,
    changedSources: summary.sourcesChanged as number, newStagedRecords: summary.rowsStaged as number,
    recordsNeedingReview: summary.rowsRequiringReview as number, failedSources: summary.sourcesFailed as number,
  };
}