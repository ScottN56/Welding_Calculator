import type { BaseMaterial, JointType, Provenance, SourceReference, WeldPosition, WeldingProcess } from '../welding/types/common';
import type { Applicability } from '../welding/types/records';
import type { Range } from '../welding/types/units';
import type { DatasetClassification } from '../welding/data/datasetClassification';
import type { MachineProfile } from './types';

export interface MachineSpecificSourceField {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
}

export interface MachineSpecificSetting {
  readonly id: string;
  readonly classification: 'machine-specific';
  readonly machineProfileId: string;
  readonly process: WeldingProcess;
  readonly settingLabel: string;
  /** The published dial/tap/control value. Never numeric or unit-normalized. */
  readonly value: string;
  readonly controlNames?: readonly string[];
  readonly originalNotation: string;
  readonly sourceRecordId: string;
  readonly sourceManualId: string;
  readonly applicability: MachineSpecificApplicability;
  readonly sourceContext: readonly MachineSpecificSourceField[];
  readonly provenance: Provenance;
}

export interface MachineSpecificDatasetMetadata {
  readonly id: string;
  readonly classification: 'machine-specific';
  readonly machineProfileId: string;
  readonly process: WeldingProcess;
  readonly sourceManualId: string;
  readonly source: SourceReference;
  readonly verifiedBy: string;
  readonly verifiedDate: string;
}

export interface MachineSpecificSettingDraft {
  readonly id: string;
  readonly settingLabel: string;
  readonly value: string;
  readonly controlNames?: readonly string[];
  readonly originalNotation: string;
  readonly sourceRecordId: string;
  readonly applicability: MachineSpecificApplicability;
  readonly sourceContext: readonly MachineSpecificSourceField[];
}

export interface MachineSpecificDataset {
  readonly classification: 'machine-specific';
  readonly metadata: MachineSpecificDatasetMetadata;
  readonly settings: readonly MachineSpecificSetting[];
}

export interface ReferenceOnlyDataset {
  readonly classification: Exclude<DatasetClassification, 'generic-recommendation' | 'machine-specific'>;
  readonly id: string;
  readonly process: WeldingProcess;
  readonly source: SourceReference;
  readonly sourceRecords: readonly unknown[];
}

function requireValue(value: string, label: string): void {
  if (!value.trim() || /^replace(?:\s|-)+with\b/i.test(value.trim())) throw new Error(`${label} must be supplied from reviewed manufacturer data.`);
}

export function defineVerifiedMachineSpecificDataset(
  profile: MachineProfile,
  metadata: MachineSpecificDatasetMetadata,
  drafts: readonly MachineSpecificSettingDraft[],
): MachineSpecificDataset {
  requireValue(profile.id, 'Machine profile ID');
  requireValue(profile.manufacturer, 'Machine manufacturer');
  requireValue(profile.model, 'Machine model');
  requireValue(profile.sourceManualId, 'Machine profile source manual ID');
  requireValue(metadata.id, 'Dataset ID');
  requireValue(metadata.sourceManualId, 'Dataset source manual ID');
  requireValue(metadata.source.publisher, 'Source publisher');
  requireValue(metadata.source.document, 'Source document');
  requireValue(metadata.verifiedBy, 'Verifier');
  if (metadata.machineProfileId !== profile.id) throw new Error('Machine-specific dataset profile ID does not match the supplied profile.');
  if (metadata.sourceManualId !== profile.sourceManualId) throw new Error('Machine profile manual ID does not match the dataset source manual.');
  if (metadata.process !== profile.processes.find((process) => process === metadata.process)) {
    throw new Error('Machine profile does not explicitly support the dataset process.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.verifiedDate)) throw new Error('verifiedDate must use YYYY-MM-DD.');

  const provenance: Provenance = {
    verified: true,
    source: metadata.source,
    verifiedBy: metadata.verifiedBy,
    verifiedDate: metadata.verifiedDate,
  };
  const settings = drafts.map((draft): MachineSpecificSetting => {
    requireValue(draft.id, 'Setting ID');
    requireValue(draft.settingLabel, 'Published setting label');
    requireValue(draft.value, 'Published machine-control value');
    requireValue(draft.originalNotation, 'Original manufacturer notation');
    requireValue(draft.sourceRecordId, 'Source record ID');
    if (draft.value !== draft.originalNotation) throw new Error(`Setting ${draft.id} must preserve its original notation exactly.`);
    if (!Number.isFinite(draft.applicability.thicknessMm.min) || !Number.isFinite(draft.applicability.thicknessMm.max) ||
      draft.applicability.thicknessMm.min <= 0 || draft.applicability.thicknessMm.max < draft.applicability.thicknessMm.min) {
      throw new Error(`Setting ${draft.id} requires an explicitly reviewed positive thickness scope.`);
    }
    return {
      ...draft,
      classification: 'machine-specific',
      machineProfileId: profile.id,
      sourceManualId: metadata.sourceManualId,
      process: metadata.process,
      provenance,
    };
  });
  return { classification: 'machine-specific', metadata, settings };
}

export interface MachineSpecificApplicability {
  readonly material: BaseMaterial;
  /** Canonical mm, populated only after human review of the printed source units. */
  readonly thicknessMm: Range;
  readonly joints: Applicability<JointType>;
  readonly positions: Applicability<WeldPosition>;
  /** Process-definition consumable keys and explicitly reviewed option values. */
  readonly consumables?: Readonly<Record<string, string>>;
}