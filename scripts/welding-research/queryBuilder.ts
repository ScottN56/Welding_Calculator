import { APPROVED_SOURCES } from '../welding-source-import/sourceRegistry';
import type { Manufacturer } from '../welding-source-import/types';
import type { ResearchFilters } from './types';

const MATERIAL_TERMS: Readonly<Record<string, string>> = {
  'carbon-steel': 'mild steel carbon steel',
  'stainless-steel': 'stainless steel',
  aluminum: 'aluminum aluminium',
};

export function manufacturerFilter(value: string | undefined): Manufacturer | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'miller') return 'Miller';
  if (normalized === 'lincoln' || normalized === 'lincoln electric' || normalized === 'lincoln-electric') return 'Lincoln Electric';
  if (normalized === 'esab') return 'ESAB';
  throw new Error(`Unknown manufacturer: ${value}. Choose miller, lincoln, or esab.`);
}

function termsFor(filters: ResearchFilters): string[] {
  const terms = [filters.query?.trim()];
  if (filters.process) terms.push(filters.process);
  if (filters.material) terms.push(MATERIAL_TERMS[filters.material] ?? filters.material);
  if (filters.thickness) terms.push(`${filters.thickness} thickness`);
  if (filters.wire) terms.push(filters.wire);
  if (filters.electrode) terms.push(filters.electrode);
  if (filters.wireDiameter) terms.push(`${filters.wireDiameter} wire diameter`);
  if (filters.shieldingGas) terms.push(filters.shieldingGas);
  if (filters.gasFlow) terms.push(`${filters.gasFlow} gas flow`);
  terms.push('welding parameters chart technical data sheet welding guide');
  return [...new Set(terms.filter((term): term is string => Boolean(term)))];
}

/** One site-restricted query per approved manufacturer; query terms are never interpreted as settings. */
export function buildResearchQueries(filters: ResearchFilters): readonly { manufacturer: Manufacturer; query: string }[] {
  const selected = manufacturerFilter(filters.manufacturer);
  const terms = termsFor(filters).join(' ');
  return APPROVED_SOURCES
    .filter((source) => !selected || source.manufacturer === selected)
    .map((source) => ({ manufacturer: source.manufacturer, query: `site:${source.domain} ${terms}`.trim() }));
}