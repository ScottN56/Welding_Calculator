import { useState } from 'react';
import { NoticeBanner } from '../components/NoticeBanner';
import { PageHeader } from '../components/PageHeader';
import { SafetyNotice } from '../components/SafetyNotice';
import { SegmentedControl } from '../components/SegmentedControl';
import { registry } from '../features/welding/data/registry';
import type { UnitSystem } from '../features/welding/types';
import type { SavedSetupsState } from '../hooks/useSavedSetups';
import type { Preferences } from '../storage/preferences';

interface SettingsPageProps {
  readonly preferences: Preferences;
  readonly onChange: (changes: Partial<Preferences>) => void;
  readonly saved: SavedSetupsState;
  readonly onNotify: (message: string) => void;
}

export function SettingsPage({ preferences, onChange, saved, onNotify }: SettingsPageProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const verified = registry.all.filter((r) => r.provenance.verified).length;
  const unverified = registry.all.length - verified;

  return (
    <div className="page">
      <PageHeader title="Settings" />

      <section className="card">
        <SegmentedControl<UnitSystem>
          label="Units"
          value={preferences.unitSystem}
          options={[
            { value: 'imperial', label: 'Imperial', hint: 'in · IPM · CFH' },
            { value: 'metric', label: 'Metric', hint: 'mm · m/min · L/min' },
          ]}
          onChange={(unitSystem) => onChange({ unitSystem })}
        />
      </section>

      <section className="card" aria-labelledby="data-title">
        <h2 id="data-title" className="card__title">
          Reference data
        </h2>
        <p>
          {verified} verified record{verified === 1 ? '' : 's'} · {unverified} sample/unverified record{unverified === 1 ? '' : 's'}
        </p>
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={preferences.includeUnverified}
            onChange={(e) => onChange({ includeUnverified: e.target.checked })}
          />
          <span className="switch__track" aria-hidden="true" />
          <span className="switch__label">Show results from sample / unverified data</span>
        </label>
        {preferences.includeUnverified && (
          <NoticeBanner tone="warning">
            Sample data is for trying out the app only. Results built from it are clearly labelled and must not be used to weld.
          </NoticeBanner>
        )}
      </section>

      <section className="card" aria-labelledby="saved-title">
        <h2 id="saved-title" className="card__title">
          Saved setups
        </h2>
        <p>
          {saved.setups.length} setup{saved.setups.length === 1 ? '' : 's'} stored on this device. Data is not backed up
          or synced.
        </p>
        {confirmClear ? (
          <div className="button-row">
            <button type="button" className="button button--secondary" onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                saved.clearAll();
                setConfirmClear(false);
                onNotify('All saved setups deleted');
              }}
            >
              Delete all
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="button button--secondary button--block"
            disabled={saved.setups.length === 0}
            onClick={() => setConfirmClear(true)}
          >
            Delete all saved setups
          </button>
        )}
      </section>

      <section className="card" aria-labelledby="about-title">
        <h2 id="about-title" className="card__title">
          About
        </h2>
        <SafetyNotice />
        <p className="muted small">Version {__APP_VERSION__} · Works offline</p>
      </section>
    </div>
  );
}
