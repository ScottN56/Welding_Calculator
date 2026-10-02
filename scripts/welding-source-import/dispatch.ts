import { prepareMillerImport } from './adapters/miller';
import { prepareLincolnPdfImport } from './adapters/lincolnPdf';
import { prepareSourceImport } from './importSource';
import type { RetrievedSource, SourceImportResult, SourceImportState } from './types';

export async function importOfficialSource(source: RetrievedSource, state: SourceImportState): Promise<SourceImportResult> {
  if (source.manufacturer === 'Miller') return prepareMillerImport(source, state);
  if (source.manufacturer === 'Lincoln Electric' && (source.mediaType === 'pdf' || source.mediaType === 'text')) return prepareLincolnPdfImport(source, state);
  return prepareSourceImport(source, state);
}