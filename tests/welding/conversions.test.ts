import { describe, expect, it } from 'vitest';
import {
  cfhToLpm,
  exactFraction,
  formatDiameter,
  formatGasFlow,
  formatNumber,
  formatThickness,
  formatWireFeed,
  inchesToMm,
  lpmToCfh,
  mmPerMinToWireFeed,
  mmToInches,
  parseInches,
  parseThickness,
  toNearestFraction,
  wireFeedToMmPerMin,
} from '../../src/features/welding/conversions';

describe('length conversion', () => {
  it('uses the exact 25.4 mm inch', () => {
    expect(inchesToMm(1)).toBe(25.4);
    expect(inchesToMm(0.25)).toBeCloseTo(6.35, 10);
    expect(mmToInches(3.175)).toBeCloseTo(0.125, 10);
  });

  it('round-trips', () => {
    for (const v of [0.035, 0.0625, 0.375, 1.5]) expect(mmToInches(inchesToMm(v))).toBeCloseTo(v, 12);
  });
});

describe('gas flow conversion', () => {
  it('converts CFH to L/min', () => {
    expect(cfhToLpm(1)).toBeCloseTo(0.471947, 6);
    expect(cfhToLpm(30)).toBeCloseTo(14.158, 3);
  });

  it('round-trips', () => {
    expect(lpmToCfh(cfhToLpm(25))).toBeCloseTo(25, 12);
  });
});

describe('wire feed conversion', () => {
  it('converts IPM and m/min to mm/min', () => {
    expect(wireFeedToMmPerMin(100, 'ipm')).toBeCloseTo(2540, 10);
    expect(wireFeedToMmPerMin(5, 'm/min')).toBe(5000);
    expect(wireFeedToMmPerMin(1234, 'mm/min')).toBe(1234);
  });

  it('converts back from mm/min', () => {
    expect(mmPerMinToWireFeed(2540, 'ipm')).toBeCloseTo(100, 10);
    expect(mmPerMinToWireFeed(5000, 'm/min')).toBe(5);
  });
});

describe('inch fraction parsing', () => {
  it.each([
    ['1/4', 0.25],
    ['3/16', 0.1875],
    ['1-1/4', 1.25],
    ['1 1/2', 1.5],
    ['0.25', 0.25],
    ['.125', 0.125],
    ['1', 1],
    ['1/4"', 0.25],
    [' 3 / 8 in ', 0.375],
    ['5/4', 1.25],
  ])('parses %s', (text, expected) => {
    expect(parseInches(text)).toBeCloseTo(expected, 12);
  });

  it.each(['', 'abc', '1/0', '1 5/4', '1//4', '-1/4', '1/4/8'])('rejects %j', (text) => {
    expect(parseInches(text)).toBeNull();
  });
});

describe('fraction formatting', () => {
  it('finds reduced power-of-two fractions', () => {
    expect(toNearestFraction(0.25)).toEqual({ whole: 0, numerator: 1, denominator: 4 });
    expect(toNearestFraction(1.1875)).toEqual({ whole: 1, numerator: 3, denominator: 16 });
    expect(toNearestFraction(0.999)).toEqual({ whole: 1, numerator: 0, denominator: 1 });
  });

  it('reports only exact fractions', () => {
    expect(exactFraction(0.0625)).not.toBeNull();
    expect(exactFraction(0.035)).toBeNull();
  });
});

describe('thickness parsing (imperial and metric)', () => {
  it('parses imperial fractions to mm', () => {
    const result = parseThickness('1/8', 'in');
    expect(result.ok && result.mm).toBeCloseTo(3.175, 10);
  });

  it('parses metric values, including comma decimals', () => {
    const a = parseThickness('6', 'mm');
    const b = parseThickness('6,5 mm', 'mm');
    expect(a.ok && a.mm).toBe(6);
    expect(b.ok && b.mm).toBe(6.5);
  });

  it('rejects zero, negatives, junk and absurd values', () => {
    expect(parseThickness('0', 'mm').ok).toBe(false);
    expect(parseThickness('-2', 'mm').ok).toBe(false);
    expect(parseThickness('abc', 'in').ok).toBe(false);
    expect(parseThickness('5000', 'mm').ok).toBe(false);
  });
});

describe('display formatting', () => {
  it('formats thickness as fractions in imperial and mm in metric', () => {
    expect(formatThickness(inchesToMm(0.25), 'imperial')).toBe('1/4"');
    expect(formatThickness(inchesToMm(1.5), 'imperial')).toBe('1-1/2"');
    expect(formatThickness(inchesToMm(0.135), 'imperial')).toBe('0.135"');
    expect(formatThickness(6.35, 'metric')).toBe('6.35 mm');
  });

  it('formats wire diameter', () => {
    expect(formatDiameter(inchesToMm(0.035), 'imperial')).toBe('0.035"');
    expect(formatDiameter(0.9, 'metric')).toBe('0.9 mm');
  });

  it('formats wire feed and gas flow in the selected system', () => {
    const wfs = { min: inchesToMm(200), max: inchesToMm(250) };
    expect(formatWireFeed(wfs, 'imperial')).toBe('200–250 IPM');
    expect(formatWireFeed(wfs, 'metric')).toBe('5.1–6.4 m/min');
    expect(formatGasFlow({ min: cfhToLpm(25), max: cfhToLpm(35) }, 'imperial')).toBe('25–35 CFH');
    expect(formatGasFlow({ min: 12, max: 16 }, 'metric')).toBe('12–16 L/min');
  });

  it('trims trailing zeros', () => {
    expect(formatNumber(18, 1)).toBe('18');
    expect(formatNumber(18.25, 1)).toBe('18.3');
  });
});
