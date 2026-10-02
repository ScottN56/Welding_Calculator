import { formatThickness, formatThicknessRange } from '../conversions';
import type { ProcessDefinition } from '../processes';
import type {
  CalculatorInput,
  DataQuality,
  RecommendationResult,
  RecommendOptions,
  WeldingRecord,
} from '../types';
import { buildFilterSteps, runFilters } from './filters';
import { interpolateRecords } from './interpolate';
import { lookupThickness } from './thicknessLookup';
import { missingConsumableErrors, validateBaseInput } from './validateInput';

export const UNVERIFIED_WARNING =
  'SAMPLE / UNVERIFIED DATA — these values are placeholders, not from a verified reference. Do not use them to weld.';
export const INTERPOLATION_WARNING =
  'Interpolated values are an estimate between two data points. Run test welds on scrap before production.';

/** Labels of categorical fields whose values differ across the given records. */
export function differingFields<R extends WeldingRecord>(definition: ProcessDefinition<R>, records: readonly R[]): string[] {
  const first = records[0];
  if (!first) return [];
  return definition.categoricalFields
    .filter(({ key }) => records.some((r) => r[key] !== first[key]))
    .map(({ label }) => label);
}

/** Among equivalent records, prefer the narrowest thickness range, then the lowest start, then id. */
export function selectPreferred<R extends WeldingRecord>(records: readonly R[]): R {
  const sorted = [...records].sort(
    (a, b) =>
      a.thicknessMm.max - a.thicknessMm.min - (b.thicknessMm.max - b.thicknessMm.min) ||
      a.thicknessMm.min - b.thicknessMm.min ||
      a.id.localeCompare(b.id),
  );
  const preferred = sorted[0];
  if (!preferred) throw new Error('selectPreferred requires at least one record');
  return preferred;
}

export function dataQualityOf(records: readonly WeldingRecord[]): DataQuality {
  return records.every((r) => r.provenance.verified) ? 'verified' : 'unverified';
}

export function recommend<R extends WeldingRecord>(
  definition: ProcessDefinition<R>,
  records: readonly R[],
  input: CalculatorInput,
  options: RecommendOptions,
): RecommendationResult<R> {
  const errors = validateBaseInput(definition, input);
  if (errors.length > 0) {
    return { status: 'invalid-input', errors, explanation: [], warnings: [] };
  }

  const system = options.unitSystem;
  const t = input.thicknessMm;
  const tLabel = formatThickness(t, system);
  const range = (r: WeldingRecord) => formatThicknessRange(r.thicknessMm, system);

  const processRecords = records.filter((r) => r.process === definition.process);
  if (processRecords.length === 0) {
    return {
      status: 'unsupported',
      stage: 'process',
      explanation: [`No reference data has been loaded for ${definition.process} yet.`],
      warnings: [],
    };
  }

  const steps = buildFilterSteps(definition, input, options);
  const filtered = runFilters(processRecords, steps);
  if (!filtered.ok) {
    const { failedStep } = filtered;
    const explanation =
      failedStep.stage === 'verification'
        ? ['No verified reference data is available for this process. Enable sample data in Settings to preview the app.']
        : [`No reference data matches ${failedStep.description} with the other selections.`];
    return {
      status: 'unsupported',
      stage: failedStep.stage,
      ...(failedStep.field === undefined ? {} : { field: failedStep.field }),
      explanation,
      warnings: [],
    };
  }

  // Checked after filtering so an unsupported material/joint/position is reported first.
  const missing = missingConsumableErrors(definition, input);
  if (missing.length > 0) {
    return { status: 'invalid-input', errors: missing, explanation: [], warnings: [] };
  }

  const matched = steps.map((s) => s.description).join(' · ');
  const lookup = lookupThickness(filtered.records, t);

  const qualityWarnings = (rs: readonly WeldingRecord[]) =>
    dataQualityOf(rs) === 'unverified' ? [UNVERIFIED_WARNING] : [];

  switch (lookup.kind) {
    case 'within': {
      const differing = differingFields(definition, lookup.matches);
      if (differing.length > 0) {
        return {
          status: 'ambiguous',
          candidates: lookup.matches,
          differingFields: differing,
          explanation: [`More than one data set covers ${tLabel}. Choose a ${differing.join(' / ')} to narrow the result.`],
          warnings: [],
        };
      }
      const chosen = selectPreferred(lookup.matches);
      const explanation = [`Matched ${matched}.`, `${tLabel} is within the data range ${range(chosen)}.`];
      if (lookup.matches.length > 1) {
        explanation.push(`${lookup.matches.length} records cover this thickness; the one with the narrowest range was used.`);
      }
      return {
        status: 'exact',
        values: chosen,
        sources: [chosen],
        dataQuality: dataQualityOf([chosen]),
        explanation,
        warnings: qualityWarnings([chosen]),
      };
    }

    case 'between': {
      const differingLower = differingFields(definition, lookup.lower);
      const differingUpper = differingFields(definition, lookup.upper);
      const differing = [...new Set([...differingLower, ...differingUpper])];
      if (differing.length > 0) {
        return {
          status: 'ambiguous',
          candidates: [...lookup.lower, ...lookup.upper],
          differingFields: differing,
          explanation: [`Data near ${tLabel} differs in ${differing.join(' / ')}. Choose one to narrow the result.`],
          warnings: [],
        };
      }
      const lower = selectPreferred(lookup.lower);
      const upper = selectPreferred(lookup.upper);
      const mismatch = differingFields(definition, [lower, upper]);
      if (mismatch.length > 0) {
        return {
          status: 'gap',
          lower,
          upper,
          explanation: [
            `${tLabel} falls between data ranges ${range(lower)} and ${range(upper)}.`,
            `Those ranges use a different ${mismatch.join(' / ')}, so values are not interpolated between them.`,
          ],
          warnings: [],
        };
      }
      if (!lower.interpolation.allowed || !upper.interpolation.allowed) {
        const blocked = [lower, upper]
          .filter((record) => !record.interpolation.allowed)
          .map((record) => record.id)
          .join(', ');
        return {
          status: 'gap',
          lower,
          upper,
          explanation: [
            `${tLabel} falls between data ranges ${range(lower)} and ${range(upper)}.`,
            `Interpolation is not explicitly permitted by the reference data${blocked ? ` (blocked by: ${blocked})` : ''}.`,
          ],
          warnings: [],
        };
      }
      const values = interpolateRecords(definition, lower, upper, t);
      const percent = Math.round(((t - lower.thicknessMm.max) / (upper.thicknessMm.min - lower.thicknessMm.max)) * 100);
      return {
        status: 'interpolated',
        values,
        sources: [lower, upper],
        dataQuality: dataQualityOf([lower, upper]),
        explanation: [
          `Matched ${matched}.`,
          `No data range contains ${tLabel}. Nearest data: ${range(lower)} and ${range(upper)}.`,
          `Values were interpolated linearly, ${percent}% of the way from the thinner to the thicker data.`,
        ],
        warnings: [INTERPOLATION_WARNING, ...qualityWarnings([lower, upper])],
      };
    }

    case 'below-min':
    case 'above-max': {
      const nearest = selectPreferred(lookup.nearest);
      const below = lookup.kind === 'below-min';
      const edge = formatThickness(below ? lookup.supported.min : lookup.supported.max, system);
      return {
        status: 'out-of-range',
        direction: lookup.kind,
        supportedRangeMm: lookup.supported,
        nearest,
        explanation: [
          `Matched ${matched}.`,
          `${tLabel} is ${below ? 'thinner' : 'thicker'} than the available data (${below ? 'minimum' : 'maximum'} ${edge}).`,
        ],
        warnings: ['No settings are shown: values are never extrapolated beyond the reference data.'],
      };
    }
  }
}
