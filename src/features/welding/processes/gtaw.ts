import {
  formatAmperage,
  formatDiameter,
  formatGasFlow,
} from '../conversions';

import {
  GAS_LABELS,
  POLARITY_LABELS,
} from '../data/catalog';

import { gtawTroubleshooting } from '../troubleshooting/gtaw';

import type {
  GtawRecord,
  ShieldingGasId,
} from '../types';

import {
  diameterFromKey,
  diameterKey,
} from './keys';

import type { ProcessDefinition } from './types';

export const gtawDefinition: ProcessDefinition<GtawRecord> = {
  process: 'GTAW',

  consumableFields: [
    {
      key: 'tungstenType',
      label: 'Tungsten Type',
      allowAny: false,

      valueOf: (record) =>
        record.tungstenType,

      formatValue: (value) =>
        value,
    },

    {
      key: 'tungstenDiameter',
      label: 'Tungsten Diameter',
      allowAny: false,

      valueOf: (record) =>
        diameterKey(record.tungstenDiameterMm),

      formatValue: (value, system) =>
        formatDiameter(
          diameterFromKey(value),
          system,
        ),
    },

    {
      key: 'gas',
      label: 'Shielding Gas',
      allowAny: false,

      valueOf: (record) =>
        record.gas,

      formatValue: (value) =>
        GAS_LABELS[value as ShieldingGasId] ?? value,
    },
  ],

  rangeKeys: [
    'amperage',
    'gasFlowLpm',
    'acBalance',
    'acFrequency',
  ],

  categoricalFields: [
    {
      key: 'current',
      label: 'Current',
    },

    {
      key: 'polarity',
      label: 'Polarity',
    },

    {
      key: 'tungstenType',
      label: 'Tungsten Type',
    },

    {
      key: 'tungstenDiameterMm',
      label: 'Tungsten Diameter',
    },

    {
      key: 'gas',
      label: 'Shielding Gas',
    },
  ],

  outputs: [
    {
      key: 'amperage',
      label: 'Amperage',
      primary: true,

      format: (record) =>
        formatAmperage(record.amperage),
    },

    {
      key: 'current',
      label: 'Current',
      primary: true,

      format: (record) =>
        record.current,
    },

    {
      key: 'polarity',
      label: 'Polarity',
      primary: false,

      format: (record) =>
        POLARITY_LABELS[record.polarity],
    },

    {
      key: 'tungstenType',
      label: 'Tungsten',
      primary: false,

      format: (record) =>
        record.tungstenType,
    },

    {
      key: 'tungstenDiameter',
      label: 'Tungsten Diameter',
      primary: false,

      format: (record, system) =>
        formatDiameter(
          record.tungstenDiameterMm,
          system,
        ),
    },

    {
      key: 'fillerClass',
      label: 'Filler',
      primary: false,

      format: (record) =>
        record.fillerClass ?? null,
    },

    {
      key: 'fillerDiameter',
      label: 'Filler Diameter',
      primary: false,

      format: (record, system) =>
        record.fillerDiameterMm
          ? formatDiameter(
              record.fillerDiameterMm,
              system,
            )
          : null,
    },

    {
      key: 'gas',
      label: 'Shielding Gas',
      primary: false,

      format: (record) =>
        GAS_LABELS[record.gas],
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

  troubleshooting: gtawTroubleshooting,
};
