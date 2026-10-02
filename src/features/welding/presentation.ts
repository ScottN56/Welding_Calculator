import { formatThickness } from './conversions';
import { JOINT_LABELS, MATERIAL_LABELS, POSITION_LABELS, PROCESS_LABELS } from './data/catalog';
import type { ProcessDefinition } from './processes';
import type { CalculatorInput, UnitSystem, WeldingRecord } from './types';

export interface DisplayItem {
  readonly key: string;
  readonly label: string;
  /** null when the reference data does not supply this value. */
  readonly value: string | null;
}

export interface SourceProvenanceItem {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly href?: string;
}

function displayableMetadata(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^(?:replace(?:\s|-)+with\b|yyyy-mm-dd\b)/i.test(trimmed)) return undefined;
  return trimmed;
}

function safeSourceUrl(value: string | undefined): string | undefined {
  const candidate = displayableMetadata(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname || url.username || url.password) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

/** Metadata shown only after dataset provenance is verified. */
export function sourceProvenanceItems(record: WeldingRecord): SourceProvenanceItem[] {
  if (!record.provenance.verified) return [];

  const source = record.provenance.source;
  const items: SourceProvenanceItem[] = [];
  const add = (key: string, label: string, value: string | undefined) => {
    const displayValue = displayableMetadata(value);
    if (displayValue) items.push({ key, label, value: displayValue });
  };

  add('publisher', 'Publisher / Manufacturer', source.publisher);
  add('document', 'Document', source.document);
  add('edition', 'Edition / Revision', source.edition);
  add('publicationDate', 'Publication Date', source.publicationDate);
  add('page', 'Page', source.page);
  add('tableOrChart', 'Table / Chart', source.tableOrChart);

  const href = safeSourceUrl(source.url);
  if (href) items.push({ key: 'url', label: 'Source', value: 'View source', href });

  add('accessedDate', 'Date Accessed', source.accessedDate);
  add('sourceNotes', 'Source Notes', source.notes);
  add('verifiedBy', 'Verified By', record.provenance.verifiedBy);
  add('verifiedDate', 'Verification Date', record.provenance.verifiedDate);

  return items;
}

export function primaryOutputs<R extends WeldingRecord>(definition: ProcessDefinition<R>, values: R, system: UnitSystem): DisplayItem[] {
  return definition.outputs
    .filter((o) => o.primary)
    .map((o) => ({ key: o.key, label: o.label, value: o.format(values, system) }));
}

export function setupSummary<R extends WeldingRecord>(
  definition: ProcessDefinition<R>,
  input: CalculatorInput,
  values: R,
  system: UnitSystem,
): DisplayItem[] {
  return [
    { key: 'process', label: 'Process', value: PROCESS_LABELS[input.process].long },
    { key: 'material', label: 'Material', value: MATERIAL_LABELS[input.material] },
    { key: 'thickness', label: 'Thickness', value: formatThickness(input.thicknessMm, system) },
    { key: 'joint', label: 'Joint', value: JOINT_LABELS[input.joint] },
    { key: 'position', label: 'Position', value: POSITION_LABELS[input.position] },
    ...definition.outputs
      .filter((o) => !o.primary)
      .map((o) => ({ key: o.key, label: o.label, value: o.format(values, system) })),
  ];
}
