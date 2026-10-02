import type { CalculatorInput, DataQuality, WeldingRecord } from '../welding/types';

export const SAVED_SETUP_SCHEMA_VERSION = 1;

/** Single values the welder actually dialed in. Canonical units. */
export interface AdjustedParameters {
  readonly voltage?: number;
  readonly wireFeedMmPerMin?: number;
  readonly amperage?: number;
  readonly gasFlowLpm?: number;
}

export interface SavedRecommendation {
  readonly status: 'exact' | 'interpolated';
  readonly dataQuality: DataQuality;
  /** Snapshot so the saved setup is unaffected by later data-table changes. */
  readonly values: WeldingRecord;
  readonly sourceRecordIds: readonly string[];
}

export interface SavedSetup {
  readonly schemaVersion: typeof SAVED_SETUP_SCHEMA_VERSION;
  readonly id: string;
  readonly name: string;
  readonly input: CalculatorInput;
  readonly recommendation: SavedRecommendation | null;
  readonly adjusted: AdjustedParameters;
  readonly notes: string;
  readonly machineProfileId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
