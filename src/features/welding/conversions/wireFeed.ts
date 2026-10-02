import type { WireFeedUnit } from '../types';
import { MM_PER_INCH } from './length';

export function wireFeedToMmPerMin(value: number, unit: WireFeedUnit): number {
  switch (unit) {
    case 'ipm':
      return value * MM_PER_INCH;
    case 'm/min':
      return value * 1000;
    case 'mm/min':
      return value;
  }
}

export function mmPerMinToWireFeed(mmPerMin: number, unit: WireFeedUnit): number {
  switch (unit) {
    case 'ipm':
      return mmPerMin / MM_PER_INCH;
    case 'm/min':
      return mmPerMin / 1000;
    case 'mm/min':
      return mmPerMin;
  }
}
