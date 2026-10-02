import { useCallback, useEffect, useState } from 'react';
import { registry } from '../features/welding/data/registry';
import { appStore } from '../storage/appStore';
import { defaultPreferences, loadPreferences, persistPreferences, type Preferences } from '../storage/preferences';

export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences>(() =>
    loadPreferences(appStore, defaultPreferences(registry.hasVerifiedData('GMAW'))),
  );

  useEffect(() => {
    persistPreferences(appStore, preferences);
  }, [preferences]);

  const updatePreferences = useCallback((changes: Partial<Preferences>) => {
    setPreferences((current) => ({ ...current, ...changes }));
  }, []);

  return { preferences, updatePreferences };
}
