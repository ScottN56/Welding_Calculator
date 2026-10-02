import type { Manufacturer } from '../welding-source-import/types';
import type { WeldingProcess } from '../../src/features/welding/types';

export interface ResearchFilters {
  readonly query?: string;
  readonly manufacturer?: Manufacturer;
  readonly process?: WeldingProcess;
  readonly material?: string;
  readonly thickness?: string;
  readonly wire?: string;
  readonly electrode?: string;
  readonly wireDiameter?: string;
  readonly shieldingGas?: string;
  readonly gasFlow?: string;
}

export interface SearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly displayLink?: string;
  readonly mime?: string;
  readonly fileFormat?: string;
}

export type TrustClassification = 'official' | 'UNTRUSTED / NOT ELIGIBLE FOR WELDING DATA';
export type ResearchUsefulness = 'likely-parameter-data' | 'technical-reference' | 'general-guide' | 'overview' | 'unsupported';
export type ResearchRank = 'excellent' | 'good' | 'manual-review' | 'unsupported';
export type ResearchSourceType = 'official PDF/manual' | 'technical data sheet' | 'parameter chart' | 'welding guide' | 'product data' | 'calculator' | 'manufacturer page' | 'unknown';

export interface ResearchCandidate {
  readonly title: string;
  readonly manufacturer: Manufacturer | null;
  readonly url: string;
  readonly snippet: string;
  readonly detectedProcess: WeldingProcess | null;
  readonly detectedMaterial: string | null;
  readonly sourceType: ResearchSourceType;
  readonly trust: TrustClassification;
  readonly usefulness: ResearchUsefulness;
  readonly rank: ResearchRank;
  readonly score: number;
  readonly rankReasons: readonly string[];
  readonly detectedFields: readonly string[];
  readonly eligibleForImporter: boolean;
  readonly importerResult?: string;
}

export interface ResearchReport {
  readonly query: string;
  readonly timestamp: string;
  readonly provider: string;
  readonly filters: ResearchFilters;
  readonly candidateUrls: readonly {
    readonly url: string;
    readonly manufacturer: Manufacturer | null;
    readonly trust: TrustClassification;
    readonly usefulness: ResearchUsefulness;
    readonly rank: ResearchRank;
    readonly score: number;
  }[];
}

export interface ResearchOutcome {
  readonly candidates: readonly ResearchCandidate[];
  readonly report: ResearchReport;
  readonly importedCount: number;
  readonly provider: string;
}