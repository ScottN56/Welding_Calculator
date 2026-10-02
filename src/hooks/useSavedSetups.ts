import { useCallback, useState } from 'react';
import {
  createSavedSetup,
  duplicateSavedSetup,
  updateSavedSetup,
  type NewSetupFields,
  type SetupChanges,
} from '../features/saved-settings/operations';
import { loadSavedSetups, persistSavedSetups } from '../features/saved-settings/repository';
import type { SavedSetup } from '../features/saved-settings/types';
import { appStore } from '../storage/appStore';
import { createId } from '../utils/misc';

export function useSavedSetups() {
  const [setups, setSetups] = useState<SavedSetup[]>(() => loadSavedSetups(appStore));
  const [storageError, setStorageError] = useState(false);

  const commit = useCallback((next: SavedSetup[]) => {
    setSetups(next);
    setStorageError(!persistSavedSetups(appStore, next));
  }, []);

  const add = useCallback(
    (fields: NewSetupFields) => {
      const setup = createSavedSetup(fields, createId(), new Date());
      commit([setup, ...setups]);
      return setup;
    },
    [commit, setups],
  );

  const update = useCallback(
    (id: string, changes: SetupChanges) =>
      commit(setups.map((s) => (s.id === id ? updateSavedSetup(s, changes, new Date()) : s))),
    [commit, setups],
  );

  const duplicate = useCallback(
    (id: string) => {
      const index = setups.findIndex((s) => s.id === id);
      const original = setups[index];
      if (!original) return;
      const copy = duplicateSavedSetup(original, createId(), new Date());
      commit([...setups.slice(0, index + 1), copy, ...setups.slice(index + 1)]);
    },
    [commit, setups],
  );

  const remove = useCallback((id: string) => commit(setups.filter((s) => s.id !== id)), [commit, setups]);
  const clearAll = useCallback(() => commit([]), [commit]);

  return { setups, storageError, add, update, duplicate, remove, clearAll };
}

export type SavedSetupsState = ReturnType<typeof useSavedSetups>;
