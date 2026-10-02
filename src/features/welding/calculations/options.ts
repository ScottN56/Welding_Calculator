import type { ProcessDefinition } from '../processes';
import type { CalculatorInput, RecommendOptions, WeldingRecord } from '../types';
import { ANY_OPTION } from '../types';
import { buildFilterSteps, runFilters } from './filters';

export interface ConsumableOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Options for one consumable field, derived from data that matches the material, joint,
 * position and all earlier consumable selections. Thickness is intentionally not applied
 * so options don't disappear while the user adjusts thickness.
 */
export function getConsumableOptions<R extends WeldingRecord>(
  definition: ProcessDefinition<R>,
  records: readonly R[],
  input: CalculatorInput,
  fieldKey: string,
  options: RecommendOptions,
): ConsumableOption[] {
  const field = definition.consumableFields.find((f) => f.key === fieldKey);
  if (!field) throw new Error(`Unknown consumable field: ${fieldKey}`);

  const steps = buildFilterSteps(definition, input, options, fieldKey);
  const outcome = runFilters(
    records.filter((r) => r.process === definition.process),
    steps,
  );
  if (!outcome.ok) return [];

  const values = [...new Set(outcome.records.map((r) => field.valueOf(r)))];
  return values.map((value) => ({ value, label: field.formatValue(value, options.unitSystem) }));
}

export interface ReconciledInput {
  readonly input: CalculatorInput;
  readonly optionsByField: Readonly<Record<string, readonly ConsumableOption[]>>;
}

/**
 * Walks consumable fields in order and replaces any selection that is no longer available
 * (e.g. after changing material) with the first available option, or ANY when allowed.
 */
export function reconcileConsumables<R extends WeldingRecord>(
  definition: ProcessDefinition<R>,
  records: readonly R[],
  input: CalculatorInput,
  options: RecommendOptions,
): ReconciledInput {
  let current = input;
  const optionsByField: Record<string, readonly ConsumableOption[]> = {};

  for (const field of definition.consumableFields) {
    const available = getConsumableOptions(definition, records, current, field.key, options);
    optionsByField[field.key] = available;
    const selected = current.consumable[field.key];
    const isAny = selected === ANY_OPTION;
    const isValid = available.some((o) => o.value === selected);
    if (isValid || (isAny && field.allowAny)) continue;

    const replacement = field.allowAny ? ANY_OPTION : available[0]?.value;
    const consumable = { ...current.consumable };
    if (replacement === undefined) delete consumable[field.key];
    else consumable[field.key] = replacement;
    current = { ...current, consumable };
  }
  return { input: current, optionsByField };
}
