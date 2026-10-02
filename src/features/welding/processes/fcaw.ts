import {
  formatAmperage,
  formatDiameter,
  formatGasFlow,
  formatVoltage,
  formatWireFeed,
} from '../conversions';

import {
  GAS_LABELS,
  POLARITY_LABELS,
} from '../data/catalog';

import { fcawTroubleshooting } from '../troubleshooting/fcaw';

import type {
  FcawRecord,
  ShieldingGasId,
} from '../types';

import {
  diameterFromKey,
  diameterKey,
} from './keys';

import type { ProcessDefinition } from './types';

function formatShielding(value: string): string {
  if (value === 'self-shielded') {
    return 'Self-Shielded';
  }

  return GAS_LABELS[value as ShieldingGasId] ?? value;
}

export const fcawDefinition: ProcessDefinition<FcawRecord> = {
  process: 'FCAW',

  consumableFields: [
    {
      key: 'wireClass',
      label: 'Wire Type',
      allowAny: false,

      valueOf: (record) => record.wireClass,

      formatValue: (value) => value,
    },

    {
      key: 'wireDiameter',
      label: 'Wire Diameter',
      allowAny: false,

      valueOf: (record) =>
        diameterKey(record.wireDiameterMm),

      formatValue: (value, system) =>
        formatDiameter(
          diameterFromKey(value),
          system,
        ),
    },

    {
      key: 'shielding',
      label: 'Shielding',
      allowAny: false,

      valueOf: (record) =>
        record.shielding,

      formatValue: (value) =>
        formatShielding(value),
    },
  ],

  rangeKeys: [
    'voltage',
    'wireFeedMmPerMin',
    'amperage',
    'gasFlowLpm',
  ],

  categoricalFields: [
    {
      key: 'wireClass',
      label: 'Wire Type',
    },

    {
      key: 'wireDiameterMm',
      label: 'Wire Diameter',
    },

    {
      key: 'shielding',
      label: 'Shielding',
    },

    {
      key: 'polarity',
      label: 'Polarity',
    },
  ],

  outputs: [
    {
      key: 'voltage',
      label: 'Voltage',
      primary: true,

      format: (record) =>
        formatVoltage(record.voltage),
    },

    {
      key: 'wireFeed',
      label: 'Wire Feed Speed',
      primary: true,

      format: (record, system) =>
        formatWireFeed(
          record.wireFeedMmPerMin,
          system,
        ),
    },

    {
      key: 'amperage',
      label: 'Est. Amperage',
      primary: true,

      format: (record) =>
        record.amperage
          ? formatAmperage(record.amperage)
          : null,
    },

    {
      key: 'wireClass',
      label: 'Wire',
      primary: false,

      format: (record) =>
        record.wireClass,
    },

    {
      key: 'wireDiameter',
      label: 'Wire Diameter',
      primary: false,

      format: (record, system) =>
        formatDiameter(
          record.wireDiameterMm,
          system,
        ),
    },

    {
      key: 'polarity',
      label: 'Polarity',
      primary: false,

      format: (record) =>
        POLARITY_LABELS[record.polarity],
    },

    {
      key: 'shielding',
      label: 'Shielding',
      primary: false,

      format: (record) =>
        formatShielding(record.shielding),
    },

    {
      key: 'gasFlow',
      label: 'Gas Flow',
      primary: false,

      format: (record, system) =>
        record.gasFlowLpm
          ? formatGasFlow(
              record.gasFlowLpm,
              system,
            )
          : null,
    },
  ],

  troubleshooting: fcawTroubleshooting,
};
