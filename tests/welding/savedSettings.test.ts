import { describe, expect, it } from 'vitest';
import {
  ADJUSTED_FIELDS,
  adjustedToTexts,
  createSavedSetup,
  duplicateSavedSetup,
  parseAdjustedTexts,
  parseSavedSetups,
  recommendedRangeText,
  toSavedRecommendation,
  updateSavedSetup,
  validateSetupName,
} from '../../src/features/saved-settings/operations';
import { loadSavedSetups, persistSavedSetups, SAVED_SETUPS_KEY } from '../../src/features/saved-settings/repository';
import { recommend } from '../../src/features/welding/calculations';
import { cfhToLpm, inchesToMm } from '../../src/features/welding/conversions';
import { gmawDefinition } from '../../src/features/welding/processes/gmaw';
import { createMemoryStore } from '../../src/storage/localStore';
import { defaultPreferences, loadPreferences, parsePreferences, PREFERENCES_KEY } from '../../src/storage/preferences';
import { gmaw, input, METRIC } from './fixtures';

const NOW = new Date('2026-05-01T12:00:00.000Z');
const LATER = new Date('2026-05-02T12:00:00.000Z');

function sample() {
  const result = recommend(gmawDefinition, [gmaw({ id: 'r1' })], input(), METRIC);
  return createSavedSetup(
    { name: '  My setup  ', input: input(), recommendation: toSavedRecommendation(result), adjusted: { voltage: 18.5 }, notes: 'n' },
    'id-1',
    NOW,
  );
}

describe('saved setup operations', () => {
  it('creates a setup with trimmed name and timestamps', () => {
    const setup = sample();
    expect(setup.name).toBe('My setup');
    expect(setup.createdAt).toBe(NOW.toISOString());
    expect(setup.recommendation?.sourceRecordIds).toEqual(['r1']);
    expect(setup.machineProfileId).toBeNull();
  });

  it('does not snapshot a recommendation for non-results', () => {
    const result = recommend(gmawDefinition, [gmaw()], input({ thicknessMm: 50 }), METRIC);
    expect(toSavedRecommendation(result)).toBeNull();
  });

  it('updates fields and bumps updatedAt only', () => {
    const updated = updateSavedSetup(sample(), { name: 'Renamed', adjusted: { amperage: 120 } }, LATER);
    expect(updated.name).toBe('Renamed');
    expect(updated.adjusted).toEqual({ amperage: 120 });
    expect(updated.createdAt).toBe(NOW.toISOString());
    expect(updated.updatedAt).toBe(LATER.toISOString());
  });

  it('duplicates with a new id and name', () => {
    const copy = duplicateSavedSetup(sample(), 'id-2', LATER);
    expect(copy.id).toBe('id-2');
    expect(copy.name).toBe('My setup (copy)');
    expect(copy.createdAt).toBe(LATER.toISOString());
  });

  it('validates names', () => {
    expect(validateSetupName('  ')).not.toBeNull();
    expect(validateSetupName('x'.repeat(81))).not.toBeNull();
    expect(validateSetupName('ok')).toBeNull();
  });
});

describe('adjusted parameters (unit conversion)', () => {
  it('converts imperial entries to canonical units', () => {
    const parsed = parseAdjustedTexts({ voltage: '19', wireFeedMmPerMin: '250', gasFlowLpm: '30', amperage: '' }, 'imperial');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.voltage).toBe(19);
    expect(parsed.value.wireFeedMmPerMin).toBeCloseTo(inchesToMm(250), 10);
    expect(parsed.value.gasFlowLpm).toBeCloseTo(cfhToLpm(30), 10);
    expect('amperage' in parsed.value).toBe(false);
  });

  it('converts metric entries and accepts comma decimals', () => {
    const parsed = parseAdjustedTexts({ wireFeedMmPerMin: '6,5', gasFlowLpm: '14' }, 'metric');
    expect(parsed.ok && parsed.value.wireFeedMmPerMin).toBe(6500);
    expect(parsed.ok && parsed.value.gasFlowLpm).toBe(14);
  });

  it('rejects invalid numbers', () => {
    const parsed = parseAdjustedTexts({ voltage: 'abc', amperage: '-5' }, 'metric');
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && Object.keys(parsed.errors).sort()).toEqual(['amperage', 'voltage']);
  });

  it('round-trips through display text', () => {
    const texts = adjustedToTexts({ wireFeedMmPerMin: inchesToMm(250), gasFlowLpm: cfhToLpm(30) }, 'imperial');
    expect(texts).toEqual({ wireFeedMmPerMin: '250', gasFlowLpm: '30' });
  });

  it('formats the recommended range hint', () => {
    const values = gmaw({ wireFeed: { min: 200, max: 250, unit: 'ipm' } });
    const wfs = ADJUSTED_FIELDS.find((f) => f.key === 'wireFeedMmPerMin')!;
    expect(recommendedRangeText(wfs, values, 'imperial')).toBe('200–250 IPM');
    const amps = ADJUSTED_FIELDS.find((f) => f.key === 'amperage')!;
    expect(recommendedRangeText(amps, { ...values, amperage: undefined }, 'imperial')).toBeNull();
  });
});

describe('saved setup storage', () => {
  it('round-trips through the store', () => {
    const store = createMemoryStore();
    persistSavedSetups(store, [sample()]);
    expect(loadSavedSetups(store)).toEqual([sample()]);
  });

  it('survives corrupt or foreign data', () => {
    const store = createMemoryStore();
    store.setItem(SAVED_SETUPS_KEY, '{not json');
    expect(loadSavedSetups(store)).toEqual([]);
    store.setItem(SAVED_SETUPS_KEY, JSON.stringify({ not: 'an array' }));
    expect(loadSavedSetups(store)).toEqual([]);
  });

  it('drops entries that do not match the schema', () => {
    const good = sample();
    const bad = [{ ...good, schemaVersion: 99 }, { ...good, input: { ...good.input, material: 'unobtanium' } }, null, 'x'];
    expect(parseSavedSetups([good, ...bad])).toEqual([good]);
  });

  it('reports write failures', () => {
    const store = { ...createMemoryStore(), setItem: () => { throw new Error('quota'); } };
    expect(persistSavedSetups(store, [sample()])).toBe(false);
  });
});

describe('preferences', () => {
  const defaults = defaultPreferences(false);

  it('defaults to imperial and shows sample data only when no verified data exists', () => {
    expect(defaults.unitSystem).toBe('imperial');
    expect(defaults.includeUnverified).toBe(true);
    expect(defaultPreferences(true).includeUnverified).toBe(false);
  });

  it('ignores invalid stored values', () => {
    expect(parsePreferences({ unitSystem: 'furlongs', includeUnverified: 'yes' }, defaults)).toEqual(defaults);
    expect(parsePreferences({ unitSystem: 'metric' }, defaults).unitSystem).toBe('metric');
  });

  it('loads from the store', () => {
    const store = createMemoryStore();
    store.setItem(PREFERENCES_KEY, JSON.stringify({ unitSystem: 'metric', includeUnverified: false }));
    expect(loadPreferences(store, defaults)).toMatchObject({ unitSystem: 'metric', includeUnverified: false });
  });
});
