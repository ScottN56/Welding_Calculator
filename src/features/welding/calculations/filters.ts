import { JOINT_LABELS, MATERIAL_LABELS, POSITION_LABELS } from '../data/catalog';
import type { ProcessDefinition } from '../processes';
import type { Applicability, CalculatorInput, FilterStage, UnitSystem, WeldingRecord } from '../types';
import { ANY_OPTION } from '../types';

export function applies<T>(list: Applicability<T>, value: T): boolean {
  return list === 'all' || list.includes(value);
}

export interface FilterStep<R extends WeldingRecord> {
  readonly stage: FilterStage;
  readonly field?: string;
  /** e.g. "Material: Aluminum" */
  readonly description: string;
  readonly predicate: (record: R) => boolean;
}

export interface FilterContext {
  readonly includeUnverified: boolean;
  readonly unitSystem: UnitSystem;
}

/**
 * Ordered filter steps for categorical (non-thickness) matching.
 * `stopBeforeField` returns only the steps preceding that consumable field (used to build option lists).
 */
export function buildFilterSteps<R extends WeldingRecord>(
  definition: ProcessDefinition<R>,
  input: CalculatorInput,
  context: FilterContext,
  stopBeforeField?: string,
): FilterStep<R>[] {
  const steps: FilterStep<R>[] = [];
  if (!context.includeUnverified) {
    steps.push({
      stage: 'verification',
      description: 'Verified data only',
      predicate: (r) => r.provenance.verified,
    });
  }
  steps.push(
    {
      stage: 'material',
      description: `Material: ${MATERIAL_LABELS[input.material]}`,
      predicate: (r) => r.material === input.material,
    },
    {
      stage: 'joint',
      description: `Joint: ${JOINT_LABELS[input.joint]}`,
      predicate: (r) => applies(r.joints, input.joint),
    },
    {
      stage: 'position',
      description: `Position: ${POSITION_LABELS[input.position]}`,
      predicate: (r) => applies(r.positions, input.position),
    },
  );

  for (const field of definition.consumableFields) {
    if (field.key === stopBeforeField) break;
    const selected = input.consumable[field.key];
    if (selected === undefined || selected === ANY_OPTION) continue;
    steps.push({
      stage: 'consumable',
      field: field.key,
      description: `${field.label}: ${field.formatValue(selected, context.unitSystem)}`,
      predicate: (r) => field.valueOf(r) === selected,
    });
  }
  return steps;
}

export type FilterOutcome<R extends WeldingRecord> =
  | { readonly ok: true; readonly records: readonly R[] }
  | { readonly ok: false; readonly failedStep: FilterStep<R> };

/** Applies steps in order and reports the first step that eliminates every record. */
export function runFilters<R extends WeldingRecord>(
  records: readonly R[],
  steps: readonly FilterStep<R>[],
): FilterOutcome<R> {
  let remaining = records;
  for (const step of steps) {
    remaining = remaining.filter(step.predicate);
    if (remaining.length === 0) return { ok: false, failedStep: step };
  }
  return { ok: true, records: remaining };
}
