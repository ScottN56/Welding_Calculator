import { useCallback, useMemo, useState } from 'react';
import { reconcileConsumables, recommend } from '../features/welding/calculations';
import { registry } from '../features/welding/data/registry';
import { inchesToMm } from '../features/welding/conversions';
import { getAnyProcessDefinition } from '../features/welding/processes';
import { MACHINE_PROFILES, MACHINE_SPECIFIC_SETTINGS } from '../features/machine-profiles/registry';
import type { CalculatorInput, RecommendOptions } from '../features/welding/types';

export const INITIAL_INPUT: CalculatorInput = {
  process: 'GMAW',
  material: 'carbon-steel',
  thicknessMm: inchesToMm(1 / 8),
  joint: 'butt',
  position: 'flat',
  consumable: {},
  machineProfileId: null,
};

export function useCalculator(options: RecommendOptions) {
  const [draft, setDraft] = useState<CalculatorInput>(INITIAL_INPUT);
  // Bumped when input is replaced from outside (e.g. opening a saved setup) so text fields reset.
  const [loadVersion, setLoadVersion] = useState(0);

  const definition = getAnyProcessDefinition(draft.process);
  if (!definition) throw new Error(`No definition for process ${draft.process}`);
  const records = registry.forProcess(draft.process);

  const { unitSystem, includeUnverified } = options;
  const reconciled = useMemo(
    () => reconcileConsumables(definition, records, draft, { unitSystem, includeUnverified }),
    [definition, records, draft, unitSystem, includeUnverified],
  );
  const result = useMemo(
    () => recommend(definition, records, reconciled.input, {
      unitSystem, includeUnverified, machineProfiles: MACHINE_PROFILES, machineSpecificSettings: MACHINE_SPECIFIC_SETTINGS,
    }),
    [definition, records, reconciled.input, unitSystem, includeUnverified],
  );

  const input = reconciled.input;
  const update = useCallback((changes: Partial<CalculatorInput>) => setDraft({ ...input, ...changes }), [input]);
  const setConsumable = useCallback(
    (key: string, value: string) => setDraft({ ...input, consumable: { ...input.consumable, [key]: value } }),
    [input],
  );
  const load = useCallback((next: CalculatorInput) => {
    setDraft(next);
    setLoadVersion((v) => v + 1);
  }, []);

  return { input, definition, optionsByField: reconciled.optionsByField, result, update, setConsumable, load, loadVersion };
}

export type CalculatorState = ReturnType<typeof useCalculator>;
