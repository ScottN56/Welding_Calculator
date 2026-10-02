export type ProcessStatus = 'available' | 'no-data' | 'not-implemented';

export function getProcessStatus(definitionExists: boolean, recordCount: number): ProcessStatus {
  if (!definitionExists) return 'not-implemented';
  return recordCount > 0 ? 'available' : 'no-data';
}