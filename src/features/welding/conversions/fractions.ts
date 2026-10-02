export interface InchFraction {
  readonly whole: number;
  readonly numerator: number;
  readonly denominator: number;
}

const MIXED_FRACTION = /^(?:(\d+)[\s-]+)?(\d+)\s*\/\s*(\d+)$/;
const DECIMAL = /^(?:\d+\.?\d*|\.\d+)$/;

/**
 * Parses inch values such as "1/4", "1-1/4", "1 1/4", "0.25", ".25", "1".
 * Returns null for anything else (including zero denominators and malformed mixed numbers).
 */
export function parseInches(text: string): number | null {
  const trimmed = text.trim().replace(/(?:"|in\.?|inch(?:es)?)$/i, '').trim();
  if (trimmed === '') return null;

  if (DECIMAL.test(trimmed)) {
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
  }

  const match = MIXED_FRACTION.exec(trimmed);
  if (!match) return null;

  const whole = match[1] === undefined ? 0 : Number(match[1]);
  const numerator = Number(match[2]);
  const denominator = Number(match[3]);
  if (denominator === 0) return null;
  // "1 5/4" is not a valid mixed number.
  if (match[1] !== undefined && numerator >= denominator) return null;

  return whole + numerator / denominator;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Nearest fraction with a power-of-two denominator up to maxDenominator, reduced. */
export function toNearestFraction(inches: number, maxDenominator = 64): InchFraction {
  const whole = Math.floor(inches);
  let numerator = Math.round((inches - whole) * maxDenominator);
  let denominator = maxDenominator;
  if (numerator === denominator) {
    return { whole: whole + 1, numerator: 0, denominator: 1 };
  }
  const divisor = numerator === 0 ? denominator : gcd(numerator, denominator);
  numerator /= divisor;
  denominator /= divisor;
  return { whole, numerator, denominator };
}

export function fractionToInches(fraction: InchFraction): number {
  return fraction.whole + fraction.numerator / fraction.denominator;
}

export function formatFraction(fraction: InchFraction): string {
  if (fraction.numerator === 0) return String(fraction.whole);
  const part = `${fraction.numerator}/${fraction.denominator}`;
  return fraction.whole === 0 ? part : `${fraction.whole}-${part}`;
}

/** Returns the fraction only if it represents the value within tolerance (in inches). */
export function exactFraction(inches: number, maxDenominator = 64, tolerance = 1e-6): InchFraction | null {
  const fraction = toNearestFraction(inches, maxDenominator);
  return Math.abs(fractionToInches(fraction) - inches) <= tolerance ? fraction : null;
}
