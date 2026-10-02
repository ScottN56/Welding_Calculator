import { formatThicknessRange } from '../features/welding/conversions';
import type { ProcessDefinition } from '../features/welding/processes';
import { primaryOutputs, setupSummary } from '../features/welding/presentation';
import type { CalculatorInput, RecommendationResult, UnitSystem, WeldingRecord } from '../features/welding/types';
import { DataQualityBadge } from './DataQualityBadge';
import { NoticeBanner } from './NoticeBanner';

interface ResultPanelProps {
  readonly result: RecommendationResult<WeldingRecord>;
  readonly definition: ProcessDefinition<WeldingRecord>;
  readonly input: CalculatorInput;
  readonly system: UnitSystem;
}

function Explanation({ lines }: { readonly lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <details className="explain">
      <summary>How this was selected</summary>
      <ul>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </details>
  );
}

function Warnings({ lines }: { readonly lines: readonly string[] }) {
  return (
    <>
      {lines.map((line) => (
        <NoticeBanner key={line} tone="warning" role="status">
          {line}
        </NoticeBanner>
      ))}
    </>
  );
}

export function ResultPanel({ result, definition, input, system }: ResultPanelProps) {
  switch (result.status) {
    case 'exact':
    case 'interpolated': {
      const primary = primaryOutputs(definition, result.values, system);
      const summary = setupSummary(definition, input, result.values, system);
      return (
        <section className="card card--result" aria-labelledby="result-title" aria-live="polite">
          <div className="result__header">
            <h2 id="result-title" className="card__title">
              Starting Range
            </h2>
            <div className="result__badges">
              <span className={`badge ${result.status === 'exact' ? 'badge--info' : 'badge--warn'}`}>
                {result.status === 'exact' ? 'From data table' : 'Interpolated estimate'}
              </span>
              <DataQualityBadge quality={result.dataQuality} />
            </div>
          </div>

          <div className="big-values">
            {primary.map((item) => (
              <div key={item.key} className="big-value">
                <span className="big-value__label">{item.label}</span>
                <span className={`big-value__value ${item.value === null ? 'big-value__value--na' : ''}`}>
                  {item.value ?? 'Not in data'}
                </span>
              </div>
            ))}
          </div>

          <Warnings lines={result.warnings} />

          <dl className="summary">
            {summary.map((item) => (
              <div key={item.key} className="summary__row">
                <dt>{item.label}</dt>
                <dd>{item.value ?? 'Not in data'}</dd>
              </div>
            ))}
          </dl>

          {result.values.notes.length > 0 && (
            <ul className="notes">
              {result.values.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}

          <Explanation lines={result.explanation} />
          <p className="source">
            Source:{' '}
            {result.sources
              .map((s) => [s.provenance.source.publisher, s.provenance.source.document].join(' — '))
              .filter((v, i, all) => all.indexOf(v) === i)
              .join('; ')}
          </p>
        </section>
      );
    }

    case 'out-of-range':
      return (
        <section className="card card--empty" aria-live="polite">
          <h2 className="card__title">No data for this thickness</h2>
          <p className="lead">
            Supported for this setup: <strong>{formatThicknessRange(result.supportedRangeMm, system)}</strong>
          </p>
          <Warnings lines={result.warnings} />
          <Explanation lines={result.explanation} />
        </section>
      );

    case 'machine-specific':
      return (
        <section className="card card--empty" aria-live="polite">
          <div className="result__header">
            <h2 className="card__title">Machine-specific setting</h2>
            <span className="badge badge--warn">Machine-specific</span>
          </div>
          <p>{result.machineProfile.manufacturer} {result.machineProfile.model}{result.machineProfile.family ? ` · ${result.machineProfile.family}` : ''}</p>
          <ul className="notes">
            {result.settings.map((setting) => (
              <li key={setting.id}>
                <strong>{setting.settingLabel}:</strong> <code>{setting.value}</code>
                {setting.controlNames?.length ? ` · ${setting.controlNames.join(', ')}` : ''}
                <span> · {setting.process} · {setting.provenance.source.document} · {setting.sourceManualId}</span>
              </li>
            ))}
          </ul>
          {result.sourceContext.length > 0 && (
            <dl className="summary">
              {result.sourceContext.map((field) => {
                const separator = field.indexOf(': ');
                const label = separator < 0 ? 'Source context' : field.slice(0, separator);
                const value = separator < 0 ? field : field.slice(separator + 2);
                return <div key={field} className="summary__row"><dt>{label}</dt><dd>{value}</dd></div>;
              })}
            </dl>
          )}
          <Warnings lines={result.warnings} />
          <Explanation lines={result.explanation} />
          <p className="source">Source values are literal machine controls, not universal voltage, amperage or wire-feed settings.</p>
        </section>
      );

    case 'gap':
      return (
        <section className="card card--empty" aria-live="polite">
          <h2 className="card__title">Between data ranges</h2>
          {result.explanation.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      );

    case 'ambiguous':
      return (
        <section className="card card--empty" aria-live="polite">
          <h2 className="card__title">Choose a {result.differingFields.join(' / ')}</h2>
          {result.explanation.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      );

    case 'unsupported':
      return (
        <section className="card card--empty" aria-live="polite">
          <h2 className="card__title">Combination not in the data</h2>
          {result.explanation.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      );

    case 'invalid-input':
      return (
        <section className="card card--empty" aria-live="polite">
          <h2 className="card__title">Check your inputs</h2>
          <ul>
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </section>
      );
  }
}
