import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { BottomNav, type TabId } from '../components/BottomNav';
import type { SavedSetup } from '../features/saved-settings/types';
import type { StagingImportRow } from '../features/welding/data/staging/importExport/types';
import { useCalculator } from '../hooks/useCalculator';
import { usePreferences } from '../hooks/usePreferences';
import { useSavedSetups } from '../hooks/useSavedSetups';
import { CalculatorPage } from '../pages/CalculatorPage';
import { ReferencePage } from '../pages/ReferencePage';
import { SavedPage } from '../pages/SavedPage';
import { SettingsPage } from '../pages/SettingsPage';

const TOAST_MS = 2500;
const DeveloperDataEntryPage = import.meta.env.DEV
  ? lazy(() => import('../pages/DeveloperDataEntryPage'))
  : null;
const DeveloperImportBatchesPage = import.meta.env.DEV
  ? lazy(() => import('../pages/DeveloperImportBatchesPage'))
  : null;

export function App() {
  const [tab, setTab] = useState<TabId>('calculator');
  const [dataEntryOpen, setDataEntryOpen] = useState(false);
  const [importBatchesOpen, setImportBatchesOpen] = useState(false);
  const [reviewBatchRows, setReviewBatchRows] = useState<readonly StagingImportRow[]>([]);
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
    setDataEntryOpen(false);
    setImportBatchesOpen(false);
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
        {import.meta.env.DEV && (
          <div className="dev-tools" aria-label="Developer tools">
            <button type="button" className="button button--secondary" onClick={() => {
              setImportBatchesOpen(false);
              setReviewBatchRows([]);
              setDataEntryOpen((current) => !current);
            }} aria-pressed={dataEntryOpen}>Data Entry</button>
            <button type="button" className="button button--secondary" onClick={() => {
              setDataEntryOpen(false);
              setImportBatchesOpen((current) => !current);
            }} aria-pressed={importBatchesOpen}>Import Batches</button>
          </div>
        )}
        {import.meta.env.DEV && dataEntryOpen && DeveloperDataEntryPage && (
          <Suspense fallback={<p role="status">Loading data entry...</p>}>
            <DeveloperDataEntryPage initialRows={reviewBatchRows} />
          </Suspense>
        )}
        {import.meta.env.DEV && importBatchesOpen && DeveloperImportBatchesPage && (
          <Suspense fallback={<p role="status">Loading import batches...</p>}>
            <DeveloperImportBatchesPage onOpenReviewQueue={(rows) => {
              setReviewBatchRows(rows);
              setImportBatchesOpen(false);
              setDataEntryOpen(true);
              window.scrollTo({ top: 0 });
            }} />
          </Suspense>
        )}
        {!dataEntryOpen && !importBatchesOpen && tab === 'calculator' && (
          <CalculatorPage
            calculator={calculator}
            preferences={preferences}
            onAcknowledgeSafety={() => updatePreferences({ safetyNoticeAcknowledged: true })}
            saved={saved}
            onNotify={notify}
          />
        )}
        {!dataEntryOpen && !importBatchesOpen && tab === 'saved' && <SavedPage saved={saved} system={preferences.unitSystem} onOpen={openSetup} onNotify={notify} />}
        {!dataEntryOpen && !importBatchesOpen && tab === 'reference' && <ReferencePage system={preferences.unitSystem} />}
        {!dataEntryOpen && !importBatchesOpen && tab === 'settings' && (
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
