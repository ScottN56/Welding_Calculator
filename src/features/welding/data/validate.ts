import type { Applicability, Measured, Range, WeldingRecordSource } from '../types';

function checkRange(errors: string[], label: string, range: Range | undefined, opts: { positive?: boolean } = {}): void {
  if (range === undefined) return;
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max)) {
    errors.push(`${label}: min and max must be finite numbers`);
    return;
  }
  if (opts.positive ? range.min <= 0 : range.min < 0) {
    errors.push(`${label}: min must be ${opts.positive ? 'greater than 0' : '0 or greater'}`);
  }
  if (range.min > range.max) errors.push(`${label}: min (${range.min}) is greater than max (${range.max})`);
}

function checkMeasured(errors: string[], label: string, value: Measured<string> | undefined): void {
  if (value !== undefined && !(Number.isFinite(value.value) && value.value > 0)) {
    errors.push(`${label}: must be a number greater than 0`);
  }
}

function checkApplicability(errors: string[], label: string, value: Applicability<string>): void {
  if (value !== 'all' && value.length === 0) errors.push(`${label}: list is empty (use 'all' or list values)`);
}

/** Returns human-readable problems with one source record; empty when valid. */
export function validateRecordSource(r: WeldingRecordSource): string[] {
  const errors: string[] = [];
  if (r.id.trim() === '') errors.push('id: must not be empty');

  checkRange(errors, 'thickness', r.thickness, { positive: true });
  checkApplicability(errors, 'joints', r.joints);
  checkApplicability(errors, 'positions', r.positions);
  checkRange(errors, 'passes', r.passes, { positive: true });

  const { provenance } = r;
  if (provenance.source.publisher.trim() === '') errors.push('provenance.source.publisher: required');
  if (provenance.source.document.trim() === '') errors.push('provenance.source.document: required');
  if (provenance.verified) {
    if (!provenance.verifiedBy?.trim()) errors.push('provenance.verifiedBy: required when verified');
    if (!provenance.verifiedDate || !/^\d{4}-\d{2}-\d{2}$/.test(provenance.verifiedDate)) {
      errors.push('provenance.verifiedDate: required as YYYY-MM-DD when verified');
    }
  }

  switch (r.process) {
    case 'GMAW':
    case 'FCAW':
      if (r.wireClass.trim() === '') errors.push('wireClass: must not be empty');
      checkMeasured(errors, 'wireDiameter', r.wireDiameter);
      checkRange(errors, 'voltage', r.voltage, { positive: true });
      checkRange(errors, 'wireFeed', r.wireFeed, { positive: true });
      checkRange(errors, 'amperage', r.amperage, { positive: true });
      checkRange(errors, 'gasFlow', r.gasFlow, { positive: true });
      break;
    case 'GTAW':
      checkRange(errors, 'amperage', r.amperage, { positive: true });
      checkMeasured(errors, 'tungstenDiameter', r.tungstenDiameter);
      checkMeasured(errors, 'fillerDiameter', r.fillerDiameter);
      checkRange(errors, 'gasFlow', r.gasFlow, { positive: true });
      checkRange(errors, 'acBalance', r.acBalance);
      checkRange(errors, 'acFrequency', r.acFrequency, { positive: true });
      break;
    case 'SMAW':
      if (r.electrodeClass.trim() === '') errors.push('electrodeClass: must not be empty');
      checkMeasured(errors, 'electrodeDiameter', r.electrodeDiameter);
      checkRange(errors, 'amperage', r.amperage, { positive: true });
      if (r.currentCompatibility.length === 0) errors.push('currentCompatibility: list is empty');
      break;
  }
  return errors;
}

/** Validates a whole data set, including duplicate ids. Errors are prefixed with the record id. */
export function validateRecordSources(records: readonly WeldingRecordSource[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) errors.push(`[${record.id}] duplicate id`);
    seen.add(record.id);
    for (const error of validateRecordSource(record)) errors.push(`[${record.id}] ${error}`);
  }
  return errors;
}
