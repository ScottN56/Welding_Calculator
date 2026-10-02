import { readJson, writeJson, type KeyValueStore } from '../../storage/localStore';
import { parseSavedSetups } from './operations';
import type { SavedSetup } from './types';

export const SAVED_SETUPS_KEY = 'weldcalc.savedSetups.v1';

export function loadSavedSetups(store: KeyValueStore): SavedSetup[] {
  return readJson(store, SAVED_SETUPS_KEY, parseSavedSetups) ?? [];
}

export function persistSavedSetups(store: KeyValueStore, setups: readonly SavedSetup[]): boolean {
  return writeJson(store, SAVED_SETUPS_KEY, setups);
}
