import type { SearchResult } from './types';

export interface SearchProvider {
  readonly name: string;
  search(query: string): Promise<readonly SearchResult[]>;
}

export interface SearchProviderFactoryResult {
  readonly provider?: SearchProvider;
  readonly message?: string;
}