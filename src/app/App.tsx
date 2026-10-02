import { useCallback, useEffect, useState } from 'react';
import { BottomNav, type TabId } from '../components/BottomNav';
import type { SavedSetup } from '../features/saved-settings/types';
import { useCalculator } from '../hooks/useCalculator';
import { usePreferences } from '../hooks/usePreferences';
import { useSavedSetups } from '../hooks/useSavedSetups';
import { CalculatorPage } from '../pages/CalculatorPage';
import { ReferencePage } from '../pages/ReferencePage';
import { SavedPage } from '../pages/SavedPage';
import { SettingsPage } from '../pages/SettingsPage';

const TOAST_MS = 2500;

export function App() {
  const [tab, setTab] = useState<TabId>('calculator');
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const { preferences, updatePreferences } = usePreferences();
  const calculator = useCalculator({
    unitSystem: preferences.unitSystem,
    includeUnverified: preferences.includeUnverified,
  });
  const saved = useSavedSetups();

  const notify = useCallback((message: string) => setToast({ id: Date.now(), message }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const changeTab = (next: TabId) => {
    setTab(next);
    window.scrollTo({ top: 0 });
  };

  const openSetup = (setup: SavedSetup) => {
    calculator.load(setup.input);
    changeTab('calculator');
  };

  return (
    <div className="app">
      <main className="app__main">
        {tab === 'calculator' && (
          <CalculatorPage
            calculator={calculator}
            preferences={preferences}
            onAcknowledgeSafety={() => updatePreferences({ safetyNoticeAcknowledged: true })}
            saved={saved}
            onNotify={notify}
          />
        )}
        {tab === 'saved' && <SavedPage saved={saved} system={preferences.unitSystem} onOpen={openSetup} onNotify={notify} />}
        {tab === 'reference' && <ReferencePage system={preferences.unitSystem} />}
        {tab === 'settings' && (
          <SettingsPage preferences={preferences} onChange={updatePreferences} saved={saved} onNotify={notify} />
        )}
      </main>

      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className="toast">
            {toast.message}
          </div>
        )}
      </div>

      <BottomNav active={tab} onChange={changeTab} savedCount={saved.setups.length} />
    </div>
  );
}
