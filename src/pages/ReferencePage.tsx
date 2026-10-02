import { DataQualityBadge } from '../components/DataQualityBadge';
import { PageHeader } from '../components/PageHeader';
import { formatNumber, formatThickness, formatThicknessRange, LPM_PER_CFH, mmToInches } from '../features/welding/conversions';
import { MATERIAL_SHORT_LABELS, POSITION_LABELS } from '../features/welding/data/catalog';
import { registry } from '../features/welding/data/registry';
import { LANL_PROCEDURE_REFERENCES } from '../features/welding/data/procedureReferences';
import { getAnyProcessDefinition } from '../features/welding/processes';
import { sourceProvenanceItems } from '../features/welding/presentation';
import { commonThicknessesMm } from '../features/welding/thicknessPresets';
import type { UnitSystem, WeldingRecord } from '../features/welding/types';

function coverageLine(record: WeldingRecord, system: UnitSystem): string {
  const definition = getAnyProcessDefinition(record.process);
  const consumable = definition?.consumableFields.map((f) => f.formatValue(f.valueOf(record), system)).join(' · ') ?? '';
  const positions = record.positions === 'all' ? 'All positions' : record.positions.map((p) => POSITION_LABELS[p]).join(', ');
  return `${MATERIAL_SHORT_LABELS[record.material]} · ${consumable} · ${positions}`;
}

export function ReferencePage({ system }: { readonly system: UnitSystem }) {
  const records = registry.all;
  return (
    <div className="page">
      <PageHeader title="Reference" subtitle="Data coverage and quick conversions" />

      <section className="card" aria-labelledby="coverage-title">
        <h2 id="coverage-title" className="card__title">
          Loaded data ({records.length} records)
        </h2>
        <ul className="coverage">
          {records.map((record) => {
            const definition = getAnyProcessDefinition(record.process);
            const flow = definition?.outputs.find((o) => o.key === 'gasFlow')?.format(record, system);
            const provenanceItems = sourceProvenanceItems(record);
            return (
              <li key={record.id} className="coverage__item">
                <div className="coverage__head">
                  <strong>{formatThicknessRange(record.thicknessMm, system)}</strong>
                  <DataQualityBadge quality={record.provenance.verified ? 'verified' : 'unverified'} />
                </div>
                <p>{coverageLine(record, system)}</p>
                {flow && <p className="muted small">Gas flow: {flow}</p>}
                {!record.provenance.verified && (
                  <p className="muted small" role="note">
                    Unverified sample data. Source details are hidden until verified.
                  </p>
                )}
                {provenanceItems.length > 0 && (
                  <dl className="summary reference-provenance">
                    {provenanceItems.map((item) => (
                      <div key={item.key} className="summary__row">
                        <dt>{item.label}</dt>
                        <dd>
                          {item.href ? (
                            <a href={item.href} target="_blank" rel="noopener noreferrer">
                              {item.value}
                            </a>
                          ) : (
                            item.value
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card" aria-labelledby="procedure-references-title">
        <h2 id="procedure-references-title" className="card__title">
          Source-specific procedure references
        </h2>
        <p className="muted small">
          These public LANL WPS documents are reference-only. They do not feed calculator recommendations and may require companion procedures or authorization.
        </p>
        <ul className="coverage">
          {LANL_PROCEDURE_REFERENCES.map((procedure) => (
            <li key={procedure.id} className="coverage__item">
              <div className="coverage__head">
                <strong>{procedure.process} · WPS {procedure.procedureNumber}</strong>
                <span className="badge badge--warn">Reference only</span>
              </div>
              <p>{procedure.title} · {procedure.revision}</p>
              <dl className="summary reference-provenance">
                <div className="summary__row">
                  <dt>Scope</dt>
                  <dd><ul>{procedure.scope.map((item) => <li key={item}>{item}</li>)}</ul></dd>
                </div>
                <div className="summary__row">
                  <dt>Use limits</dt>
                  <dd><ul>{procedure.useRequirements.map((item) => <li key={item}>{item}</li>)}</ul></dd>
                </div>
                <div className="summary__row">
                  <dt>Publisher</dt>
                  <dd>Los Alamos National Laboratory</dd>
                </div>
                <div className="summary__row">
                  <dt>Original WPS</dt>
                  <dd><a href={procedure.sourceUrl} target="_blank" rel="noopener noreferrer">Open source PDF</a></dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="thickness-title">
        <h2 id="thickness-title" className="card__title">
          Thickness conversions
        </h2>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Fraction</th>
              <th scope="col">Decimal</th>
              <th scope="col">mm</th>
            </tr>
          </thead>
          <tbody>
            {commonThicknessesMm('imperial').map((mm) => (
              <tr key={mm}>
                <td>{formatThickness(mm, 'imperial')}</td>
                <td>{formatNumber(mmToInches(mm), 4)}"</td>
                <td>{formatNumber(mm, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card" aria-labelledby="terms-title">
        <h2 id="terms-title" className="card__title">
          Terms and units
        </h2>
        <dl className="summary">
          <div className="summary__row">
            <dt>DCEP</dt>
            <dd>Direct current, electrode positive (“reverse polarity”)</dd>
          </div>
          <div className="summary__row">
            <dt>DCEN</dt>
            <dd>Direct current, electrode negative (“straight polarity”)</dd>
          </div>
          <div className="summary__row">
            <dt>IPM</dt>
            <dd>Inches per minute (wire feed speed)</dd>
          </div>
          <div className="summary__row">
            <dt>CFH</dt>
            <dd>Cubic feet per hour; 1 CFH = {formatNumber(LPM_PER_CFH, 3)} L/min</dd>
          </div>
          <div className="summary__row">
            <dt>Gas flow</dt>
            <dd>10 L/min ≈ {formatNumber(10 / LPM_PER_CFH, 1)} CFH</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
