import type { WeldingProcess } from '../welding/types';

/**
 * Future feature: user-defined machine profiles. Intentionally no built-in machine settings;
 * dial/tap mappings must come from the user or verified manufacturer data.
 */
export interface MachineProfile {
  readonly id: string;
  readonly manufacturer: 'Miller' | 'Lincoln Electric' | 'ESAB' | string;
  readonly model: string;
  readonly family?: string;
  readonly processes: readonly WeldingProcess[];
  /** Official manual/source identity that establishes this profile. */
  readonly sourceManualId: string;
  readonly serialRange?: { readonly min?: string; readonly max?: string };
  readonly revisionRange?: { readonly min?: string; readonly max?: string };
  readonly notes?: string;
}

export type MachineControl =
  | { readonly kind: 'direct' }
  /** Machine shows a dial or tap number rather than real units. */
  | { readonly kind: 'dial'; readonly min: number; readonly max: number; readonly step: number };
