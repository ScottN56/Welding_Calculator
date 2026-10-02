import type { TroubleshootingGuide } from '../features/welding/troubleshooting/types';

export function FineTunePanel({ guide }: { readonly guide: TroubleshootingGuide }) {
  return (
    <section className="card" aria-labelledby="fine-tune-title">
      <h2 id="fine-tune-title" className="card__title">
        Fine Tune Your Weld
      </h2>
      <p className="muted">{guide.sourceNote}</p>
      <div className="accordion">
        {guide.tips.map((tip) => (
          <details key={tip.id} className="accordion__item">
            <summary className="accordion__summary">{tip.symptom}</summary>
            <p className="accordion__lead">Settings to investigate:</p>
            <ul className="accordion__list">
              {tip.investigate.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
