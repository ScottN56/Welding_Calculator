import { formatAmperage, formatDiameter } from '../conversions';
import { POLARITY_LABELS } from '../data/catalog';
import { smawTroubleshooting } from '../troubleshooting/smaw';
import type { Polarity, SmawRecord } from '../types';
import { diameterFromKey, diameterKey } from './keys';
import type { ProcessDefinition } from './types';

function compatibilityKey(values: readonly Polarity[]): string {
  return [...new Set(values)].sort().join('|');
}

function formatCompatibility(value: string): string {
  return value
    .split('|')
    .map((polarity) => POLARITY_LABELS[polarity as Polarity] ?? polarity)
    .join(', ');
}

function sameCompatibility(left: SmawRecord, right: SmawRecord): boolean {
  const leftValues = new Set(left.currentCompatibility);
  const rightValues = new Set(right.currentCompatibility);
  return leftValues.size === rightValues.size && [...leftValues].every((value) => rightValues.has(value));
}

export const smawDefinition: ProcessDefinition<SmawRecord> = {
  process: 'SMAW',
  consumableFields: [
    {
      key: 'electrodeClass',
      label: 'Electrode Classification',
      allowAny: false,
      valueOf: (record) => record.electrodeClass,
      formatValue: (value) => value,
    },
    {
      key: 'electrodeDiameter',
      label: 'Electrode Diameter',
      allowAny: false,
      valueOf: (record) => diameterKey(record.electrodeDiameterMm),
      formatValue: (value, system) => formatDiameter(diameterFromKey(value), system),
    },
    {
      key: 'currentCompatibility',
      label: 'AC/DC Compatibility',
      allowAny: true,
      valueOf: (record) => compatibilityKey(record.currentCompatibility),
      formatValue: formatCompatibility,
    },
    {
      key: 'polarity',
      label: 'Polarity',
      allowAny: true,
      valueOf: (record) => record.polarity,
      formatValue: (value) => POLARITY_LABELS[value as Polarity] ?? value,
    },
  ],
  rangeKeys: ['amperage'],
  categoricalFields: [
    { key: 'electrodeClass', label: 'Electrode Classification' },
    { key: 'electrodeDiameterMm', label: 'Electrode Diameter' },
    {
      key: 'currentCompatibility',
      label: 'AC/DC Compatibility',
      equals: sameCompatibility,
    },
    { key: 'polarity', label: 'Polarity' },
  ],
  outputs: [
    {
      key: 'amperage',
      label: 'Amperage',
      primary: true,
      format: (record) => formatAmperage(record.amperage),
    },
    {
      key: 'electrodeClass',
      label: 'Electrode Classification',
      primary: false,
      format: (record) => record.electrodeClass,
    },
    {
      key: 'electrodeDiameter',
      label: 'Electrode Diameter',
      primary: false,
      format: (record, system) => formatDiameter(record.electrodeDiameterMm, system),
    },
    {
      key: 'currentCompatibility',
      label: 'AC/DC Compatibility',
      primary: false,
      format: (record) => formatCompatibility(compatibilityKey(record.currentCompatibility)),
    },
    {
      key: 'polarity',
      label: 'Polarity',
      primary: false,
      format: (record) => POLARITY_LABELS[record.polarity],
    },
  ],
  troubleshooting: smawTroubleshooting,
};