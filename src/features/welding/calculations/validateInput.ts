import { validateThicknessMm } from '../conversions';
import type { ProcessDefinition } from '../processes';
import type { CalculatorInput, WeldingRecord } from '../types';
import { ANY_OPTION } from '../types';

export function validateBaseInput<R extends WeldingRecord>(definition: ProcessDefinition<R>, input: CalculatorInput): string[] {
  const errors: string[] = [];
  if (input.process !== definition.process) {
    errors.push(`Input process ${input.process} does not match ${definition.process}.`);
  }
  const thicknessError = validateThicknessMm(input.thicknessMm);
  if (thicknessError) errors.push(thicknessError);
  return errors;
}

export function missingConsumableErrors<R extends WeldingRecord>(definition: ProcessDefinition<R>, input: CalculatorInput): string[] {
  const errors: string[] = [];
  for (const field of definition.consumableFields) {
    if (field.allowAny) continue;
    const value = input.consumable[field.key];
    if (value === undefined || value === '' || value === ANY_OPTION) {
      errors.push(`Select a ${field.label.toLowerCase()}.`);
    }
  }
  return errors;
}

export function validateCalculatorInput<R extends WeldingRecord>(
  definition: ProcessDefinition<R>,
  input: CalculatorInput,
): string[] {
  return [...validateBaseInput(definition, input), ...missingConsumableErrors(definition, input)];
}
