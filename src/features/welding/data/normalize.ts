import { flowToLpm, lengthToMm, wireFeedToMmPerMin } from '../conversions';
import type {
  FlowUnit,
  LengthUnit,
  Measured,
  MeasuredRange,
  Range,
  WeldingRecord,
  WeldingRecordSource,
  WireFeedUnit,
} from '../types';

const lengthRangeMm = (r: MeasuredRange<LengthUnit>): Range => ({
  min: lengthToMm(r.min, r.unit),
  max: lengthToMm(r.max, r.unit),
});
const lengthMm = (m: Measured<LengthUnit>): number => lengthToMm(m.value, m.unit);
const flowLpm = (r: MeasuredRange<FlowUnit>): Range => ({ min: flowToLpm(r.min, r.unit), max: flowToLpm(r.max, r.unit) });
const wireFeedMmPerMin = (r: MeasuredRange<WireFeedUnit>): Range => ({
  min: wireFeedToMmPerMin(r.min, r.unit),
  max: wireFeedToMmPerMin(r.max, r.unit),
});
const plainRange = (r: Range): Range => ({ min: r.min, max: r.max });

/** Converts a source record (chart units) to canonical units. */
export function normalizeRecord(source: WeldingRecordSource): WeldingRecord {
  const base = {
    id: source.id,
    material: source.material,
    thicknessMm: lengthRangeMm(source.thickness),
    joints: source.joints,
    positions: source.positions,
    passes: source.passes && plainRange(source.passes),
    interpolation: source.interpolation ?? { allowed: false },
    notes: source.notes ?? [],
    provenance: source.provenance,
  };

  switch (source.process) {
    case 'GMAW':
      return {
        ...base,
        process: 'GMAW',
        wireClass: source.wireClass,
        wireDiameterMm: lengthMm(source.wireDiameter),
        gas: source.gas,
        transferMode: source.transferMode,
        polarity: source.polarity,
        voltage: plainRange(source.voltage),
        wireFeedMmPerMin: wireFeedMmPerMin(source.wireFeed),
        amperage: source.amperage && plainRange(source.amperage),
        gasFlowLpm: source.gasFlow && flowLpm(source.gasFlow),
      };
    case 'FCAW':
      return {
        ...base,
        process: 'FCAW',
        wireClass: source.wireClass,
        wireDiameterMm: lengthMm(source.wireDiameter),
        shielding: source.shielding,
        polarity: source.polarity,
        voltage: plainRange(source.voltage),
        wireFeedMmPerMin: wireFeedMmPerMin(source.wireFeed),
        amperage: source.amperage && plainRange(source.amperage),
        gasFlowLpm: source.gasFlow && flowLpm(source.gasFlow),
      };
    case 'GTAW':
      return {
        ...base,
        process: 'GTAW',
        current: source.current,
        polarity: source.polarity,
        amperage: plainRange(source.amperage),
        tungstenType: source.tungstenType,
        tungstenDiameterMm: lengthMm(source.tungstenDiameter),
        fillerClass: source.fillerClass,
        fillerDiameterMm: source.fillerDiameter && lengthMm(source.fillerDiameter),
        gas: source.gas,
        gasFlowLpm: source.gasFlow && flowLpm(source.gasFlow),
        acBalance: source.acBalance && plainRange(source.acBalance),
        acFrequency: source.acFrequency && plainRange(source.acFrequency),
      };
    case 'SMAW':
      return {
        ...base,
        process: 'SMAW',
        electrodeClass: source.electrodeClass,
        electrodeDiameterMm: lengthMm(source.electrodeDiameter),
        currentCompatibility: source.currentCompatibility,
        polarity: source.polarity,
        amperage: plainRange(source.amperage),
      };
  }
}
