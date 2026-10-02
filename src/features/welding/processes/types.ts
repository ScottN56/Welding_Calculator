import type { TroubleshootingGuide } from '../troubleshooting/types';
import type { RangeKey, UnitSystem, WeldingRecord } from '../types';

export interface ConsumableFieldDefinition<R extends WeldingRecord> {
  /** Key used in CalculatorInput.consumable. */
  readonly key: string;
  readonly label: string;
  /** When true the user may leave this as ANY_OPTION. */
  readonly allowAny: boolean;
  /** Canonical, comparable option key for a record. */
  valueOf(record: R): string;
  formatValue(value: string, system: UnitSystem): string;
}

export interface OutputFieldDefinition<R extends WeldingRecord> {
  readonly key: string;
  readonly label: string;
  /** Primary outputs are shown large on the result screen. */
  readonly primary: boolean;
  /** Returns null when the source data does not provide this value. */
  format(record: R, system: UnitSystem): string | null;
}

export interface CategoricalFieldDefinition<R extends WeldingRecord> {
  readonly key: keyof R & string;
  readonly label: string;
  readonly equals?: (left: R, right: R) => boolean;
}

export interface ProcessDefinition<R extends WeldingRecord> {
  readonly process: R['process'];
  readonly consumableFields: readonly ConsumableFieldDefinition<R>[];
  /** Numeric range fields that may be interpolated between neighbouring records. */
  readonly rangeKeys: readonly RangeKey<R>[];
  /** Fields that must be identical for two records to be interpolated or treated as equivalent. */
  readonly categoricalFields: readonly CategoricalFieldDefinition<R>[];
  readonly outputs: readonly OutputFieldDefinition<R>[];
  readonly troubleshooting: TroubleshootingGuide;
}
