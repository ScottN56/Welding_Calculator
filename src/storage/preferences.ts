import type { UnitSystem } from '../features/welding/types';
import { isRecord } from '../utils/misc';
import { readJson, writeJson, type KeyValueStore } from './localStore';

export interface Preferences {
  readonly unitSystem: UnitSystem;
  /** Show results built from sample/unverified data (clearly labelled). */
  readonly includeUnverified: boolean;
  readonly safetyNoticeAcknowledged: boolean;
}

export const PREFERENCES_KEY = 'weldcalc.preferences.v1';

export function defaultPreferences(hasVerifiedData: boolean): Preferences {
  return { unitSystem: 'imperial', includeUnverified: !hasVerifiedData, safetyNoticeAcknowledged: false };
}

export function parsePreferences(raw: unknown, defaults: Preferences): Preferences {
  if (!isRecord(raw)) return defaults;
  return {
    unitSystem: raw.unitSystem === 'metric' || raw.unitSystem === 'imperial' ? raw.unitSystem : defaults.unitSystem,
    includeUnverified: typeof raw.includeUnverified === 'boolean' ? raw.includeUnverified : defaults.includeUnverified,
    safetyNoticeAcknowledged:
      typeof raw.safetyNoticeAcknowledged === 'boolean' ? raw.safetyNoticeAcknowledged : defaults.safetyNoticeAcknowledged,
  };
}

export function loadPreferences(store: KeyValueStore, defaults: Preferences): Preferences {
  return readJson(store, PREFERENCES_KEY, (raw) => parsePreferences(raw, defaults)) ?? defaults;
}

export function persistPreferences(store: KeyValueStore, preferences: Preferences): boolean {
  return writeJson(store, PREFERENCES_KEY, preferences);
}
