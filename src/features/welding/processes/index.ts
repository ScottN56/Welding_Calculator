import type { RecordByProcess, WeldingProcess, WeldingRecord } from '../types';
import { fcawDefinition } from './fcaw';
import { gmawDefinition } from './gmaw';
import { gtawDefinition } from './gtaw';
import { smawDefinition } from './smaw';
import type { ProcessDefinition } from './types';

type DefinitionMap = { readonly [P in WeldingProcess]?: ProcessDefinition<RecordByProcess[P]> };

/** Definitions remain unavailable until their process data and UI are ready. */
export const PROCESS_DEFINITIONS: DefinitionMap = {
  GMAW: gmawDefinition,
  FCAW: fcawDefinition,
  GTAW: gtawDefinition,
  SMAW: smawDefinition,
};

export function getProcessDefinition<P extends WeldingProcess>(
  process: P,
): ProcessDefinition<RecordByProcess[P]> | undefined {
  return PROCESS_DEFINITIONS[process] as ProcessDefinition<RecordByProcess[P]> | undefined;
}

/** Process-agnostic view for UI code that works with any record type. */
export function getAnyProcessDefinition(process: WeldingProcess): ProcessDefinition<WeldingRecord> | undefined {
  return PROCESS_DEFINITIONS[process] as unknown as ProcessDefinition<WeldingRecord> | undefined;
}

export type { ConsumableFieldDefinition, OutputFieldDefinition, ProcessDefinition } from './types';
export { diameterKey, diameterFromKey } from './keys';
export { getProcessStatus } from './availability';
export type { ProcessStatus } from './availability';
