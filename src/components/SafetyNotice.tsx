export const SAFETY_SHORT =
  'Starting-point recommendations only — not a Welding Procedure Specification. Actual settings depend on your machine, consumables, joint preparation, fit-up, position, shielding gas, manufacturer recommendations, applicable code requirements and welding procedure.';

export const SAFETY_CRITICAL =
  'For critical or code work, follow the applicable WPS and the equipment and consumable manufacturer recommendations. These values do not guarantee weld quality or code compliance.';

export function SafetyNotice({ compact = false }: { readonly compact?: boolean }) {
  return (
    <aside className={`safety ${compact ? 'safety--compact' : ''}`} aria-label="Safety and accuracy notice">
      <p>{SAFETY_SHORT}</p>
      <p>
        <strong>{SAFETY_CRITICAL}</strong>
      </p>
    </aside>
  );
}
