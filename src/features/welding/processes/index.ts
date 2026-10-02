import type { RecordByProcess, WeldingProcess, WeldingRecord } from '../types';
import { gmawDefinition } from './gmaw';
import type { ProcessDefinition } from './types';

type DefinitionMap = { readonly [P in WeldingProcess]?: ProcessDefinition<RecordByProcess[P]> };

/** Add a process here once its definition and data exist. */
export const PROCESS_DEFINITIONS: DefinitionMap = {
  GMAW: gmawDefinition,
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
