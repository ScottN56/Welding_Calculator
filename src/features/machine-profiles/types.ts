import type { WeldingProcess } from '../welding/types';

/**
 * Future feature: user-defined machine profiles. Intentionally no built-in machine settings;
 * dial/tap mappings must come from the user or verified manufacturer data.
 */
export interface MachineProfile {
  readonly id: string;
  /** User-facing name, e.g. "Shop MIG #2". */
  readonly name: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly processes: readonly WeldingProcess[];
  readonly voltageControl?: MachineControl;
  readonly wireFeedControl?: MachineControl;
  readonly notes: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type MachineControl =
  | { readonly kind: 'direct' }
  /** Machine shows a dial or tap number rather than real units. */
  | { readonly kind: 'dial'; readonly min: number; readonly max: number; readonly step: number };
