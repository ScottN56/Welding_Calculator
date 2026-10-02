import { formatThickness } from './conversions';
import { JOINT_LABELS, MATERIAL_LABELS, POSITION_LABELS, PROCESS_LABELS } from './data/catalog';
import type { ProcessDefinition } from './processes';
import type { CalculatorInput, UnitSystem, WeldingRecord } from './types';

export interface DisplayItem {
  readonly key: string;
  readonly label: string;
  /** null when the reference data does not supply this value. */
  readonly value: string | null;
}

export function primaryOutputs<R extends WeldingRecord>(definition: ProcessDefinition<R>, values: R, system: UnitSystem): DisplayItem[] {
  return definition.outputs
    .filter((o) => o.primary)
    .map((o) => ({ key: o.key, label: o.label, value: o.format(values, system) }));
}

export function setupSummary<R extends WeldingRecord>(
  definition: ProcessDefinition<R>,
  input: CalculatorInput,
  values: R,
  system: UnitSystem,
): DisplayItem[] {
  return [
    { key: 'process', label: 'Process', value: PROCESS_LABELS[input.process].long },
    { key: 'material', label: 'Material', value: MATERIAL_LABELS[input.material] },
    { key: 'thickness', label: 'Thickness', value: formatThickness(input.thicknessMm, system) },
    { key: 'joint', label: 'Joint', value: JOINT_LABELS[input.joint] },
    { key: 'position', label: 'Position', value: POSITION_LABELS[input.position] },
    ...definition.outputs
      .filter((o) => !o.primary)
      .map((o) => ({ key: o.key, label: o.label, value: o.format(values, system) })),
  ];
}
