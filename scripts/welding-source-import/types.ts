import type { StagingImportRow } from '../../src/features/welding/data/staging/importExport/types';
import type { SourceClassification } from '../../src/features/welding/data/staging/types';
import type { ImportBatch } from '../../src/features/welding/data/staging/importBatch';

export type Manufacturer = 'Miller' | 'Lincoln Electric' | 'ESAB';
export type CatalogSourceType = 'manufacturer-product-page' | 'pdf-table' | 'interactive-calculator';
export type SourceMediaType = 'html' | 'pdf' | 'json' | 'text';

export interface ApprovedSource {
  readonly manufacturer: Manufacturer;
  readonly domain: string;
  readonly parser: string | null;
  readonly additionalHosts?: readonly string[];
}

export type ParameterKind = 'wireDiameter' | 'amperage' | 'voltage' | 'wireFeed';

export interface ExtractedParameter {
  readonly kind: ParameterKind;
  readonly header: string;
  readonly text: string;
  readonly unit: string | undefined;
  readonly min: string | undefined;
  readonly max: string | undefined;
}

export interface ExtractedRow {
  readonly tableIdentifier: string;
  readonly rowNumber: number;
  readonly headers: readonly string[];
  readonly cells: readonly string[];
  readonly parameters: readonly ExtractedParameter[];
  readonly errors: readonly string[];
}

export interface ParsedSource {
  readonly title: string;
  readonly parserName: string;
  readonly parserVersion: string;
  readonly rows: readonly ExtractedRow[];
}

export interface RetrievedSource {
  readonly url: string;
  readonly manufacturer: Manufacturer;
  readonly retrievedAt: string;
  readonly bytes: Uint8Array;
  readonly html: string;
  readonly mediaType?: SourceMediaType;
  readonly sourceId?: string;
  readonly sourceType?: CatalogSourceType;
  readonly sourceClassification?: SourceClassification;
  readonly localFileName?: string;
  readonly importTimestamp?: string;
  readonly batchId?: string;
}

export interface SourceImportProvenance {
  readonly manufacturer: Manufacturer;
  readonly sourceUrl: string;
  readonly documentTitle: string;
  readonly retrievedAt: string;
  readonly parserName: string;
  readonly parserVersion: string;
  readonly sha256: string;
  readonly sourceId?: string;
  readonly sourceType?: CatalogSourceType;
  readonly sourceClassification?: SourceClassification;
  readonly localFileName?: string;
  readonly importTimestamp?: string;
  readonly batchId?: string;
  readonly manualNumber?: string;
  readonly edition?: string;
  readonly pageNumber?: number;
  readonly tableTitle?: string;
}

export interface SourceImportState {
  readonly format: 'weldcalc-dev-staged-gmaw';
  readonly version: 1;
  readonly sources: readonly SourceImportProvenance[];
  readonly rows: readonly StagingImportRow[];
  readonly batches?: readonly ImportBatch[];
  readonly lastScan?: Readonly<Record<string, unknown>>;
}

export interface SourceImportResult {
  readonly status: 'imported' | 'unchanged' | 'changed' | 'unsupported';
  readonly message: string;
  readonly addedRows: number;
  readonly validRows: number;
  readonly rowsWithErrors: number;
  readonly state: SourceImportState;
  readonly provenance: SourceImportProvenance;
  readonly batchRows?: readonly StagingImportRow[];
  readonly parserWarnings?: readonly string[];
  readonly discovery?: {
    readonly sourceType: string;
    readonly publicDataDetected: boolean;
    readonly rowsParsed: number;
    readonly eligibleRows: number;
    readonly tables: readonly { title: string; classification: SourceClassification }[];
    readonly warnings: readonly string[];
  };
  readonly categories?: {
    readonly directParameterRows: number;
    readonly machineSettingRows: number;
    readonly unsupportedRows: number;
    readonly parseFailures: number;
    readonly duplicatesSkipped: number;
  };
  readonly pdfDiagnostics?: readonly {
    readonly pageNumber: number;
    readonly pageRotation: number;
    readonly textItemCount: number;
    readonly detectedTableHeadings: readonly string[];
    readonly structuredExtractionSucceeded: boolean;
    readonly manualReviewRequired: boolean;
    readonly status: 'structured' | 'no-table-detected' | 'manual-review-required';
  }[];
}