import { DataQualityBadge } from '../components/DataQualityBadge';
import { PageHeader } from '../components/PageHeader';
import { formatNumber, formatThickness, formatThicknessRange, LPM_PER_CFH, mmToInches } from '../features/welding/conversions';
import { MATERIAL_SHORT_LABELS, POSITION_LABELS } from '../features/welding/data/catalog';
import { registry } from '../features/welding/data/registry';
import { getAnyProcessDefinition } from '../features/welding/processes';
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
            return (
              <li key={record.id} className="coverage__item">
                <div className="coverage__head">
                  <strong>{formatThicknessRange(record.thicknessMm, system)}</strong>
                  <DataQualityBadge quality={record.provenance.verified ? 'verified' : 'unverified'} />
                </div>
                <p>{coverageLine(record, system)}</p>
                {flow && <p className="muted small">Gas flow: {flow}</p>}
                <p className="muted small">
                  Source: {record.provenance.source.publisher} — {record.provenance.source.document}
                  {record.provenance.source.page ? `, p. ${record.provenance.source.page}` : ''}
                </p>
              </li>
            );
          })}
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
