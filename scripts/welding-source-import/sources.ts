import { WELDING_PROCESSES, type WeldingProcess } from '../../src/features/welding/types';
import type { SourceClassification } from '../../src/features/welding/data/staging/types';
import { approvedSourceUrl } from './sourceRegistry';
import type { Manufacturer } from './types';

export type SourceAdapter = 'esab' | 'lincoln-pdf' | 'miller';
export interface ScanSource {
  readonly id: string;
  readonly manufacturer: Manufacturer;
  readonly url: string;
  readonly expectedSourceType: 'html' | 'pdf';
  readonly enabled: boolean;
  readonly process?: WeldingProcess;
  readonly notes: string;
  readonly adapter: SourceAdapter;
  readonly sourceType?: 'manufacturer-product-page' | 'pdf-table' | 'interactive-calculator';
  readonly sourceClassification?: SourceClassification;
  readonly expectedTable?: string;
  readonly processes?: readonly WeldingProcess[];
}

export const OFFICIAL_SCAN_SOURCES: readonly ScanSource[] = [
  {
    id: 'esab-exaton-309lmo-gmaw', manufacturer: 'ESAB',
    url: 'https://esab.com/us/nam_en/products-solutions/product/filler-metals/stainless-steel/mig-wires-tig-rods-gmaw-gtaw/exaton-22-15-3-l-gmaw/',
    expectedSourceType: 'html', sourceType: 'manufacturer-product-page', enabled: true, process: 'GMAW', adapter: 'esab',
    sourceClassification: 'recommended-setting', expectedTable: 'Recommended Welding Parameters',
    notes: 'Official ESAB United States Exaton 309LMo (GMAW) product page; historical URL name confirmed by public index. Extract only published columns; missing applicability remains unsupported.',
  },
  {
    id: 'lincoln-im591-application-chart', manufacturer: 'Lincoln Electric',
    url: 'https://ch-delivery.lincolnelectric.com/api/public/content/26bb630a782f417b85ce6424c1c9a96d?v=8fc8c600',
    expectedSourceType: 'pdf', sourceType: 'pdf-table', enabled: true, adapter: 'lincoln-pdf', processes: ['GMAW', 'FCAW'],
    sourceClassification: 'machine-specific-setting', expectedTable: 'SUGGESTED SETTINGS FOR WELDING',
    notes: 'Official im591.pdf URL confirmed by public index. MIG and Innershield chart context remains literal; machine-control codes are never generic voltage, current or wire-feed values.',
  },
  {
    id: 'miller-weld-setting-calculators', manufacturer: 'Miller',
    url: 'https://www.millerwelds.com/en-us/resources/weld-setting-calculators',
    expectedSourceType: 'html', sourceType: 'interactive-calculator', enabled: true, adapter: 'miller',
    processes: ['GMAW', 'FCAW', 'GTAW', 'SMAW'], sourceClassification: 'unsupported',
    notes: 'Official overview advertises MIG solid wire, flux-cored, TIG and Stick. Discovery only: public machine-readable data is not assumed; no private APIs or inferred settings.',
  },
];

export function validateScanCatalog(sources: readonly ScanSource[]): void {
  const ids = new Set<string>();
  for (const source of sources) {
    if (!source.id.trim() || ids.has(source.id)) throw new Error(`Empty or duplicate scan source ID: ${source.id}`);
    ids.add(source.id);
  }
}

export function validateScanSource(source: ScanSource): void {
  const adapters: Record<Manufacturer, SourceAdapter> = { ESAB: 'esab', 'Lincoln Electric': 'lincoln-pdf', Miller: 'miller' };
  if (approvedSourceUrl(source.url).source.manufacturer !== source.manufacturer || adapters[source.manufacturer] !== source.adapter) {
    throw new Error(`Manufacturer/adapter does not match approved source: ${source.id}`);
  }
  if (!['html', 'pdf'].includes(source.expectedSourceType) ||
    (source.adapter === 'esab' && source.expectedSourceType !== 'html') ||
    (source.adapter === 'lincoln-pdf' && source.expectedSourceType !== 'pdf') ||
    (source.process !== undefined && !(WELDING_PROCESSES as readonly string[]).includes(source.process))) {
    throw new Error(`Unsupported catalog source type or process: ${source.id}`);
  }
}