import type { MachineSpecificDataset, MachineSpecificSetting } from './machineSpecific';
import type { MachineProfile } from './types';

/** No machine models are registered until exact model/manual provenance is supplied. */
export const MACHINE_PROFILES: readonly MachineProfile[] = [];
export const MACHINE_SPECIFIC_DATASETS: readonly MachineSpecificDataset[] = [];
export const MACHINE_SPECIFIC_SETTINGS: readonly MachineSpecificSetting[] = MACHINE_SPECIFIC_DATASETS.flatMap((dataset) => dataset.settings);

export function findMachineProfile(id: string | null | undefined): MachineProfile | undefined {
  if (!id) return undefined;
  return MACHINE_PROFILES.find((profile) => profile.id === id);
}