import { describe, expect, it } from 'vitest';
import { defineVerifiedMachineSpecificDataset } from '../src/features/machine-profiles/machineSpecific';
import type { MachineProfile } from '../src/features/machine-profiles/types';
import { recommend } from '../src/features/welding/calculations/recommend';
import { defineVerifiedDataset } from '../src/features/welding/data/datasets';
import type { GmawRecordSource } from '../src/features/welding/types';
import { PROCESS_DEFINITIONS } from '../src/features/welding/processes';
import { gmaw, gmawSource, input, METRIC } from './welding/fixtures';

function fictionalProfile(id = 'fictional-lincoln-170', sourceManualId = 'IM-FICTIONAL'): MachineProfile {
  return {
    id, manufacturer: 'Fictional Manufacturer', model: 'Fictional 170', family: 'Fictional family',
    processes: ['GMAW', 'FCAW'], sourceManualId,
    notes: 'Fictional profile for unit tests only.',
  };
}

function fictionalMachineDataset(profile = fictionalProfile()) {
  return defineVerifiedMachineSpecificDataset(profile, {
    id: 'fictional-machine-settings', classification: 'machine-specific', machineProfileId: profile.id,
    process: 'GMAW', sourceManualId: profile.sourceManualId,
    source: { publisher: 'Fictional Manufacturer', document: 'Fictional Operator Manual', page: '9', tableOrChart: 'APPLICATION CHART', url: 'https://example.invalid/manual.pdf' },
    verifiedBy: 'Fictional reviewer', verifiedDate: '2026-10-02',
  }, [{
    id: 'fictional-b3-row', settingLabel: 'Published setting', value: 'B-3', controlNames: ['Mode selector'],
    originalNotation: 'B-3', sourceRecordId: 'fictional-record-page-9-row-1',
    applicability: {
      material: 'carbon-steel', thicknessMm: { min: 1, max: 3 }, joints: 'all', positions: 'all',
    },
    sourceContext: [
      { label: 'Process', value: 'GMAW' }, { label: 'Wire', value: 'Fictional WIRE-A' },
      { label: 'Shielding gas', value: 'Fictional mix' }, { label: 'Thickness', value: '1-3', unit: 'mm' },
    ],
  }]);
}

describe('machine-specific welding data isolation', () => {
  const definition = PROCESS_DEFINITIONS.GMAW!;

  it('continues to use generic records with no machine selected', () => {
    const genericDataset = defineVerifiedDataset<GmawRecordSource>({
      id: 'fictional-generic', process: 'GMAW', source: { publisher: 'Fictional source', document: 'Fictional generic chart' },
      verifiedBy: 'Fictional reviewer', verifiedDate: '2026-10-02',
    }, [gmawSource()]);
    expect(genericDataset.classification).toBe('generic-recommendation');
    const result = recommend(definition, [gmaw()], input({ machineProfileId: null }), METRIC);
    expect(result.status).toBe('exact');
  });

  it('does not show machine-specific settings without a selected profile', () => {
    const dataset = fictionalMachineDataset();
    const result = recommend(definition, [], input({ machineProfileId: null }), {
      ...METRIC, machineProfiles: [fictionalProfile()], machineSpecificSettings: dataset.settings,
    });
    expect(result).toMatchObject({ status: 'unsupported', stage: 'machine-profile' });
    if (result.status === 'unsupported') expect(result.explanation.join(' ')).toContain('Select a matching verified machine profile');
  });

  it('returns an exact literal control only for the matching verified machine and source scope', () => {
    const profile = fictionalProfile();
    const dataset = fictionalMachineDataset(profile);
    const result = recommend(definition, [], input({ machineProfileId: profile.id }), {
      ...METRIC, machineProfiles: [profile], machineSpecificSettings: dataset.settings,
    });
    expect(result.status).toBe('machine-specific');
    if (result.status !== 'machine-specific') return;
    expect(dataset.classification).toBe('machine-specific');
    expect(result.settings[0]?.value).toBe('B-3');
    expect(typeof result.settings[0]?.value).toBe('string');
    expect(result.settings[0]?.sourceManualId).toBe('IM-FICTIONAL');
    expect(result.settings[0]?.provenance).toMatchObject({ verified: true, source: { document: 'Fictional Operator Manual', page: '9' } });
    expect(result.sourceContext).toEqual(expect.arrayContaining(['Process: GMAW', 'Wire: Fictional WIRE-A', 'Shielding gas: Fictional mix', 'Thickness: 1-3 mm']));
  });

  it('rejects a wrong machine and never falls back to a generic approximation', () => {
    const matchedProfile = fictionalProfile();
    const wrongProfile = fictionalProfile('other-machine', 'IM-OTHER');
    const dataset = fictionalMachineDataset(matchedProfile);
    const result = recommend(definition, [gmaw()], input({ machineProfileId: wrongProfile.id }), {
      ...METRIC, machineProfiles: [matchedProfile, wrongProfile], machineSpecificSettings: dataset.settings,
    });
    expect(result).toMatchObject({ status: 'unsupported', stage: 'machine-profile' });
    if (result.status === 'unsupported') expect(result.explanation.join(' ')).toContain('Generic fallback is disabled');
  });

  it('rejects a matching machine when the reviewed source applicability does not match thickness', () => {
    const profile = fictionalProfile();
    const dataset = fictionalMachineDataset(profile);
    const result = recommend(definition, [], input({ machineProfileId: profile.id, thicknessMm: 4 }), {
      ...METRIC, machineProfiles: [profile], machineSpecificSettings: dataset.settings,
    });
    expect(result).toMatchObject({ status: 'unsupported', stage: 'machine-profile' });
  });

  it('rejects non-machine-specific settings when their literal notation was altered', () => {
    const profile = fictionalProfile();
    expect(() => defineVerifiedMachineSpecificDataset(profile, {
      id: 'bad-dataset', classification: 'machine-specific', machineProfileId: profile.id,
      process: 'GMAW', sourceManualId: profile.sourceManualId,
      source: { publisher: 'Fictional Manufacturer', document: 'Fictional manual' },
      verifiedBy: 'Fictional reviewer', verifiedDate: '2026-10-02',
    }, [{
      id: 'bad-row', settingLabel: 'Setting', value: 'B-3', originalNotation: '3', sourceRecordId: 'fictional-row',
      applicability: { material: 'carbon-steel', thicknessMm: { min: 1, max: 3 }, joints: 'all', positions: 'all' },
      sourceContext: [],
    }])).toThrow('preserve its original notation exactly');
  });
});