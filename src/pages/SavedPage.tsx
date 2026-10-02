import { useState } from 'react';
import { DataQualityBadge } from '../components/DataQualityBadge';
import { NoticeBanner } from '../components/NoticeBanner';
import { PageHeader } from '../components/PageHeader';
import { SetupEditor } from '../components/SetupEditor';
import { ADJUSTED_FIELDS, adjustedToTexts } from '../features/saved-settings/operations';
import type { SavedSetup } from '../features/saved-settings/types';
import { formatThickness } from '../features/welding/conversions';
import { JOINT_LABELS, MATERIAL_SHORT_LABELS, POSITION_LABELS, PROCESS_LABELS } from '../features/welding/data/catalog';
import { primaryOutputs } from '../features/welding/presentation';
import { getAnyProcessDefinition } from '../features/welding/processes';
import type { UnitSystem } from '../features/welding/types';
import type { SavedSetupsState } from '../hooks/useSavedSetups';

interface SavedPageProps {
  readonly saved: SavedSetupsState;
  readonly system: UnitSystem;
  readonly onOpen: (setup: SavedSetup) => void;
  readonly onNotify: (message: string) => void;
}

function SetupCard({
  setup,
  system,
  onOpen,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  readonly setup: SavedSetup;
  readonly system: UnitSystem;
  readonly onOpen: () => void;
  readonly onEdit: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { input, recommendation } = setup;
  const definition = getAnyProcessDefinition(input.process);
  const primary = definition && recommendation ? primaryOutputs(definition, recommendation.values, system) : [];
  const adjusted = adjustedToTexts(setup.adjusted, system);
  const adjustedItems = ADJUSTED_FIELDS.filter((f) => adjusted[f.key] !== undefined);

  return (
    <article className="card saved-card">
      <header className="saved-card__header">
        <h2 className="saved-card__name">{setup.name}</h2>
        {recommendation && <DataQualityBadge quality={recommendation.dataQuality} />}
      </header>
      <p className="saved-card__meta">
        {PROCESS_LABELS[input.process].short} · {MATERIAL_SHORT_LABELS[input.material]} · {formatThickness(input.thicknessMm, system)} ·{' '}
        {JOINT_LABELS[input.joint]} · {POSITION_LABELS[input.position]}
      </p>
      {primary.length > 0 && (
        <dl className="saved-card__values">
          {primary.map((item) => (
            <div key={item.key}>
              <dt>Rec. {item.label}</dt>
              <dd>{item.value ?? '—'}</dd>
            </div>
          ))}
        </dl>
      )}
      {adjustedItems.length > 0 && (
        <dl className="saved-card__values saved-card__values--mine">
          {adjustedItems.map((f) => (
            <div key={f.key}>
              <dt>My {f.label}</dt>
              <dd>
                {adjusted[f.key]} {f.unitLabel(system)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {setup.notes && <p className="saved-card__notes">{setup.notes}</p>}
      <p className="muted small">Created {new Date(setup.createdAt).toLocaleDateString()}</p>

      {confirming ? (
        <div className="button-row" role="group" aria-label="Confirm delete">
          <button type="button" className="button button--secondary" onClick={() => setConfirming(false)}>
            Keep
          </button>
          <button type="button" className="button button--danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      ) : (
        <div className="button-grid">
          <button type="button" className="button button--primary" onClick={onOpen}>
            Open
          </button>
          <button type="button" className="button button--secondary" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="button button--secondary" onClick={onDuplicate}>
            Duplicate
          </button>
          <button type="button" className="button button--secondary" onClick={() => setConfirming(true)}>
            Delete
          </button>
        </div>
      )}
    </article>
  );
}

export function SavedPage({ saved, system, onOpen, onNotify }: SavedPageProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = saved.setups.find((s) => s.id === editingId);

  return (
    <div className="page">
      <PageHeader title="Saved Settings" subtitle="Stored on this device only" />

      {saved.storageError && (
        <NoticeBanner tone="danger" role="alert" title="Could not save to device storage">
          Changes may be lost when the app closes. Free up storage and try again.
        </NoticeBanner>
      )}

      {saved.setups.length === 0 ? (
        <div className="card card--empty">
          <h2 className="card__title">No saved setups yet</h2>
          <p>Use “Save this setup” on the Calculator to keep a setup and the settings you actually dialed in.</p>
        </div>
      ) : (
        <div className="saved-list">
          {saved.setups.map((setup) => (
            <SetupCard
              key={setup.id}
              setup={setup}
              system={system}
              onOpen={() => onOpen(setup)}
              onEdit={() => setEditingId(setup.id)}
              onDuplicate={() => {
                saved.duplicate(setup.id);
                onNotify('Setup duplicated');
              }}
              onDelete={() => {
                saved.remove(setup.id);
                onNotify('Setup deleted');
              }}
            />
          ))}
        </div>
      )}

      {editing && (
        <SetupEditor
          title="Edit setup"
          initial={{ name: editing.name, notes: editing.notes, adjusted: editing.adjusted }}
          recommendation={editing.recommendation}
          system={system}
          onSave={(values) => {
            saved.update(editing.id, values);
            setEditingId(null);
            onNotify('Setup updated');
          }}
          onCancel={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
