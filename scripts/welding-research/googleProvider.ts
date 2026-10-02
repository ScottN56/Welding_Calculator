import type { SearchProvider, SearchProviderFactoryResult } from './searchProvider';
import type { SearchResult } from './types';

export const GOOGLE_PROVIDER_NOT_CONFIGURED = 'Google search provider is not configured.';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseGoogleSearchResponse(payload: unknown): readonly SearchResult[] {
  if (!isObject(payload) || !Array.isArray(payload.items)) return [];
  return payload.items.flatMap((item): SearchResult[] => {
    if (!isObject(item) || typeof item.title !== 'string' || typeof item.link !== 'string' || typeof item.snippet !== 'string') return [];
    let url: URL;
    try { url = new URL(item.link); } catch { return []; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return [];
    return [{
      title: item.title, url: url.href, snippet: item.snippet,
      ...(typeof item.displayLink === 'string' ? { displayLink: item.displayLink } : {}),
      ...(typeof item.mime === 'string' ? { mime: item.mime } : {}),
      ...(typeof item.fileFormat === 'string' ? { fileFormat: item.fileFormat } : {}),
    }];
  });
}

export class GoogleSearchProvider implements SearchProvider {
  readonly name = 'Google Custom Search JSON API';

  constructor(
    private readonly apiKey: string,
    private readonly engineId: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  async search(query: string): Promise<readonly SearchResult[]> {
    const endpoint = new URL('https://www.googleapis.com/customsearch/v1');
    endpoint.searchParams.set('key', this.apiKey);
    endpoint.searchParams.set('cx', this.engineId);
    endpoint.searchParams.set('q', query);
    endpoint.searchParams.set('num', '10');
    const response = await this.request(endpoint.href, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Google Custom Search JSON API returned HTTP ${response.status}.`);
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new Error('Google Custom Search JSON API returned malformed JSON.'); }
    return parseGoogleSearchResponse(payload);
  }
}

export function createGoogleSearchProvider(
  environment: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
): SearchProviderFactoryResult {
  const apiKey = environment.GOOGLE_SEARCH_API_KEY?.trim();
  const engineId = environment.GOOGLE_SEARCH_ENGINE_ID?.trim();
  if (!apiKey || !engineId) return { message: GOOGLE_PROVIDER_NOT_CONFIGURED };
  return { provider: new GoogleSearchProvider(apiKey, engineId, request) };
}

export function loadResearchEnvironment(): void {
  if (typeof process.loadEnvFile !== 'function') return;
  try { process.loadEnvFile('.env'); }
  catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
}