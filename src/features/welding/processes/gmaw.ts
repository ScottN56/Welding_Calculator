import { formatAmperage, formatDiameter, formatGasFlow, formatVoltage, formatWireFeed } from '../conversions';
import { GAS_LABELS, POLARITY_LABELS, TRANSFER_MODE_LABELS } from '../data/catalog';
import { gmawTroubleshooting } from '../troubleshooting/gmaw';
import type { GmawRecord, GmawTransferMode, ShieldingGasId } from '../types';
import { diameterKey, diameterFromKey } from './keys';
import type { ProcessDefinition } from './types';

export const gmawDefinition: ProcessDefinition<GmawRecord> = {
  process: 'GMAW',
  available: true,
  consumableFields: [
    {
      key: 'wireClass',
      label: 'Wire Type',
      allowAny: false,
      valueOf: (r) => r.wireClass,
      formatValue: (v) => v,
    },
    {
      key: 'wireDiameter',
      label: 'Wire Diameter',
      allowAny: false,
      valueOf: (r) => diameterKey(r.wireDiameterMm),
      formatValue: (v, system) => formatDiameter(diameterFromKey(v), system),
    },
    {
      key: 'gas',
      label: 'Shielding Gas',
      allowAny: false,
      valueOf: (r) => r.gas,
      formatValue: (v) => GAS_LABELS[v as ShieldingGasId] ?? v,
    },
    {
      key: 'transferMode',
      label: 'Transfer Mode',
      allowAny: true,
      valueOf: (r) => r.transferMode,
      formatValue: (v) => TRANSFER_MODE_LABELS[v as GmawTransferMode] ?? v,
    },
  ],
  rangeKeys: ['voltage', 'wireFeedMmPerMin', 'amperage', 'gasFlowLpm'],
  categoricalFields: [
    { key: 'wireClass', label: 'Wire Type' },
    { key: 'wireDiameterMm', label: 'Wire Diameter' },
    { key: 'gas', label: 'Shielding Gas' },
    { key: 'transferMode', label: 'Transfer Mode' },
    { key: 'polarity', label: 'Polarity' },
  ],
  outputs: [
    { key: 'voltage', label: 'Voltage', primary: true, format: (r) => formatVoltage(r.voltage) },
    {
      key: 'wireFeed',
      label: 'Wire Feed Speed',
      primary: true,
      format: (r, s) => formatWireFeed(r.wireFeedMmPerMin, s),
    },
    {
      key: 'amperage',
      label: 'Est. Amperage',
      primary: true,
      format: (r) => (r.amperage ? formatAmperage(r.amperage) : null),
    },
    { key: 'wireClass', label: 'Wire', primary: false, format: (r) => r.wireClass },
    { key: 'wireDiameter', label: 'Wire Diameter', primary: false, format: (r, s) => formatDiameter(r.wireDiameterMm, s) },
    { key: 'polarity', label: 'Polarity', primary: false, format: (r) => POLARITY_LABELS[r.polarity] },
    { key: 'gas', label: 'Shielding Gas', primary: false, format: (r) => GAS_LABELS[r.gas] },
    {
      key: 'gasFlow',
      label: 'Gas Flow',
      primary: false,
      format: (r, s) => (r.gasFlowLpm ? formatGasFlow(r.gasFlowLpm, s) : null),
    },
    { key: 'transferMode', label: 'Transfer Mode', primary: false, format: (r) => TRANSFER_MODE_LABELS[r.transferMode] },
  ],
  troubleshooting: gmawTroubleshooting,
};
