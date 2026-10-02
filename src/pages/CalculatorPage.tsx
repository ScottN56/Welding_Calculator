import { useState } from 'react';
import { FineTunePanel } from '../components/FineTunePanel';
import { NoticeBanner } from '../components/NoticeBanner';
import { PageHeader } from '../components/PageHeader';
import { ResultPanel } from '../components/ResultPanel';
import { SafetyNotice, SAFETY_CRITICAL, SAFETY_SHORT } from '../components/SafetyNotice';
import { SegmentedControl } from '../components/SegmentedControl';
import { SelectField } from '../components/SelectField';
import { SetupEditor, type SetupEditorValues } from '../components/SetupEditor';
import { ThicknessInput } from '../components/ThicknessInput';
import { toSavedRecommendation } from '../features/saved-settings/operations';
import { formatThickness } from '../features/welding/conversions';
import {
  JOINT_LABELS,
  MATERIAL_SHORT_LABELS,
  POSITION_LABELS,
  PROCESS_LABELS,
} from '../features/welding/data/catalog';
import { primaryOutputs } from '../features/welding/presentation';
import { registry } from '../features/welding/data/registry';
import { MACHINE_PROFILES } from '../features/machine-profiles/registry';
import { getProcessStatus, PROCESS_DEFINITIONS } from '../features/welding/processes';
import {
  ANY_OPTION,
  BASE_MATERIALS,
  JOINT_TYPES,
  WELD_POSITIONS,
  WELDING_PROCESSES,
  type WeldingProcess,
} from '../features/welding/types';
import type { CalculatorState } from '../hooks/useCalculator';
import type { SavedSetupsState } from '../hooks/useSavedSetups';
import type { Preferences } from '../storage/preferences';

interface CalculatorPageProps {
  readonly calculator: CalculatorState;
  readonly preferences: Preferences;
  readonly onAcknowledgeSafety: () => void;
  readonly saved: SavedSetupsState;
  readonly onNotify: (message: string) => void;
}

export function CalculatorPage({ calculator, preferences, onAcknowledgeSafety, saved, onNotify }: CalculatorPageProps) {
  const { input, definition, optionsByField, result, update, setConsumable, loadVersion } = calculator;
  const system = preferences.unitSystem;
  const [editorOpen, setEditorOpen] = useState(false);
  const found = result.status === 'exact' || result.status === 'interpolated';
  const recommendation = toSavedRecommendation(result);

  const save = (values: SetupEditorValues) => {
    saved.add({ ...values, input, recommendation });
    setEditorOpen(false);
    onNotify('Setup saved');
  };

  const quickSummary = found ? primaryOutputs(definition, result.values, system).filter((i) => i.value !== null) : [];

  return (
    <div className="page">
      <PageHeader title="Weld Calculator" subtitle="Recommended starting range" />

      {!preferences.safetyNoticeAcknowledged && (
        <NoticeBanner tone="info" title="Before you start">
          <p>{SAFETY_SHORT}</p>
          <p>{SAFETY_CRITICAL}</p>
          <button type="button" className="button button--primary" onClick={onAcknowledgeSafety}>
            I understand
          </button>
        </NoticeBanner>
      )}

      <div className="calculator">
        <section className="card calculator__inputs" aria-label="Weld setup">
          <SegmentedControl<WeldingProcess>
            label="Process"
            value={input.process}
            options={WELDING_PROCESSES.map((p) => {
              const status = getProcessStatus(
                PROCESS_DEFINITIONS[p] !== undefined,
                registry.forProcess(p).length,
              );
              const hint =
                status === 'no-data'
                  ? 'No verified data'
                  : status === 'not-implemented'
                    ? 'Coming soon'
                    : undefined;
              return {
                value: p,
                label: PROCESS_LABELS[p].short,
                disabled: status === 'not-implemented',
                ...(hint === undefined ? {} : { hint }),
              };
            })}
            onChange={(process) => update({ process, consumable: {} })}
          />

          <SelectField
            label="Machine Profile (optional)"
            value={input.machineProfileId ?? 'generic'}
            options={[
              { value: 'generic', label: 'Generic / No specific machine' },
              ...MACHINE_PROFILES.map((profile) => ({
                value: profile.id,
                label: `${profile.manufacturer} ${profile.model}${profile.family ? ` (${profile.family})` : ''}`,
              })),
            ]}
            onChange={(machineProfileId) => update({ machineProfileId: machineProfileId === 'generic' ? null : machineProfileId })}
          />

          <SegmentedControl
            label="Base Material"
            value={input.material}
            options={BASE_MATERIALS.map((m) => ({ value: m, label: MATERIAL_SHORT_LABELS[m] }))}
            onChange={(material) => update({ material })}
          />

          <ThicknessInput
            key={`${system}-${loadVersion}`}
            valueMm={input.thicknessMm}
            system={system}
            onChange={(thicknessMm) => update({ thicknessMm })}
          />

          <SegmentedControl
            label="Joint"
            value={input.joint}
            columns={2}
            options={JOINT_TYPES.map((j) => ({ value: j, label: JOINT_LABELS[j] }))}
            onChange={(joint) => update({ joint })}
          />

          <SegmentedControl
            label="Position"
            value={input.position}
            columns={2}
            options={WELD_POSITIONS.map((p) => ({ value: p, label: POSITION_LABELS[p] }))}
            onChange={(position) => update({ position })}
          />

          {definition.consumableFields.map((field) => {
            const fieldOptions = optionsByField[field.key] ?? [];
            const options =
              field.allowAny && fieldOptions.length > 0 ? [{ value: ANY_OPTION, label: 'Any / not sure' }, ...fieldOptions] : fieldOptions;
            return (
              <SelectField
                key={field.key}
                label={field.label}
                value={input.consumable[field.key] ?? ''}
                options={options}
                onChange={(value) => setConsumable(field.key, value)}
                emptyText="No data for these selections"
              />
            );
          })}
        </section>

        <div className="calculator__results" id="results">
          <ResultPanel result={result} definition={definition} input={input} system={system} />

          <button
            type="button"
            className="button button--primary button--block"
            disabled={!found}
            onClick={() => setEditorOpen(true)}
          >
            Save this setup
          </button>

          <FineTunePanel guide={definition.troubleshooting} />
          <SafetyNotice compact />
        </div>
      </div>

      {quickSummary.length > 0 && (
        <a className="quick-bar" href="#results" aria-label="Jump to results">
          {quickSummary.map((i) => i.value).join('  ·  ')}
        </a>
      )}

      {editorOpen && (
        <SetupEditor
          title="Save setup"
          initial={{
            name: `${formatThickness(input.thicknessMm, system)} ${MATERIAL_SHORT_LABELS[input.material]} – ${JOINT_LABELS[input.joint]}, ${POSITION_LABELS[input.position]}`,
            notes: '',
            adjusted: {},
          }}
          recommendation={recommendation}
          system={system}
          onSave={save}
          onCancel={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}
