import type { TroubleshootingGuide } from './types';

export const gmawTroubleshooting: TroubleshootingGuide = {
  reviewed: false,
  sourceNote:
    'General troubleshooting guidance — not yet reviewed against a verified source. Change one setting at a time in small steps and re-test on scrap.',
  tips: [
    {
      id: 'spatter',
      symptom: 'Too much spatter',
      investigate: [
        'Voltage relative to wire-feed speed (arc length too short or too long)',
        'Contact-tip-to-work distance (stickout) — too long is common',
        'Polarity — solid-wire GMAW is normally DCEP; confirm the leads',
        'Shielding gas type and flow, and base-metal cleanliness',
      ],
    },
    {
      id: 'stubbing',
      symptom: 'Wire pushing the gun backward (stubbing)',
      investigate: [
        'Wire-feed speed may be too high for the voltage',
        'Voltage may be too low for the wire-feed speed',
        'Work clamp connection and cable condition',
      ],
    },
    {
      id: 'burnback',
      symptom: 'Wire burning back to the contact tip',
      investigate: [
        'Wire-feed speed may be too low for the voltage',
        'Stickout too short / gun held too close',
        'Feeding problems: drive-roll tension, liner, tip size or wear',
        'Burnback/anti-stick setting, if your machine has one',
      ],
    },
    {
      id: 'high-bead',
      symptom: 'Weld sitting too high (ropey, not wetting in)',
      investigate: [
        'Voltage may be too low for the wire-feed speed',
        'Travel speed too slow or gun angle too steep',
        'Joint fit-up and base-metal cleanliness at the toes',
      ],
    },
    {
      id: 'excess-penetration',
      symptom: 'Excessive penetration or burn-through',
      investigate: [
        'Wire-feed speed (amperage) may be too high for the thickness',
        'Travel speed may be too slow',
        'Root gap / fit-up too wide',
        'Wire diameter may be too large for the material',
      ],
    },
    {
      id: 'lack-of-penetration',
      symptom: 'Lack of penetration or fusion',
      investigate: [
        'Wire-feed speed (amperage) may be too low for the thickness',
        'Travel speed too fast, or stickout too long (reduces current)',
        'Gun angle — keep the arc on the leading edge of the puddle',
        'Joint preparation: bevel, root opening, land',
      ],
    },
    {
      id: 'undercut',
      symptom: 'Undercut along the toes',
      investigate: [
        'Voltage may be too high (arc too long)',
        'Travel speed may be too fast',
        'Gun angle, and dwell at the toes when weaving',
      ],
    },
    {
      id: 'porosity',
      symptom: 'Porosity',
      investigate: [
        'Gas coverage: flow rate (too low or too high), leaks, drafts, empty cylinder',
        'Nozzle spatter build-up or stickout too long',
        'Contamination: oil, rust, paint, coatings, moisture',
        'Correct gas for the wire and material',
      ],
    },
  ],
};
