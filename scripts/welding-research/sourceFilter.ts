import { approvedSourceUrl } from '../welding-source-import/sourceRegistry';
import type { Manufacturer } from '../welding-source-import/types';
import type { SearchResult, TrustClassification } from './types';

export const UNTRUSTED_LABEL: TrustClassification = 'UNTRUSTED / NOT ELIGIBLE FOR WELDING DATA';

export interface FilteredSearchResult {
  readonly result: SearchResult;
  readonly manufacturer: Manufacturer | null;
  readonly trust: TrustClassification;
  readonly normalizedUrl: string;
}

export function classifySourceUrl(url: string): { readonly manufacturer: Manufacturer | null; readonly trust: TrustClassification; readonly normalizedUrl: string } {
  try {
    const approved = approvedSourceUrl(url);
    return { manufacturer: approved.source.manufacturer, trust: 'official', normalizedUrl: approved.url.href };
  } catch {
    let normalizedUrl = url;
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      normalizedUrl = parsed.href;
    } catch { /* Keep malformed result URL as display-only untrusted text. */ }
    return { manufacturer: null, trust: UNTRUSTED_LABEL, normalizedUrl };
  }
}

export function filterAndDeduplicateResults(results: readonly SearchResult[], options: {
  readonly manufacturer?: Manufacturer;
  readonly includeUntrusted?: boolean;
} = {}): readonly FilteredSearchResult[] {
  const seen = new Set<string>();
  const filtered: FilteredSearchResult[] = [];
  for (const result of results) {
    const classification = classifySourceUrl(result.url);
    if (options.manufacturer && classification.manufacturer !== options.manufacturer) continue;
    if (!options.includeUntrusted && classification.trust !== 'official') continue;
    const key = classification.normalizedUrl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    filtered.push({ result: { ...result, url: classification.normalizedUrl }, ...classification });
  }
  return filtered;
}

interface RobotsRule { readonly allow: boolean; readonly path: string }
interface RobotsPolicy { readonly rules: readonly RobotsRule[]; readonly crawlDelayMs: number; readonly allowed: boolean }

function parseRobots(text: string): RobotsPolicy {
  let agents: string[] = [];
  let inWildcardGroup = false;
  const rules: RobotsRule[] = [];
  let crawlDelayMs = 0;
  let groupHasRules = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0]?.trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const directive = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (directive === 'user-agent') {
      if (groupHasRules) {
        agents = [];
        groupHasRules = false;
      }
      agents.push(value.toLowerCase());
      inWildcardGroup = agents.includes('*');
      continue;
    }
    if (!inWildcardGroup) continue;
    if (directive === 'allow' || directive === 'disallow') {
      if (value) rules.push({ allow: directive === 'allow', path: value });
      groupHasRules = true;
    } else if (directive === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 60) crawlDelayMs = Math.max(crawlDelayMs, seconds * 1000);
      groupHasRules = true;
    }
  }
  return { rules, crawlDelayMs, allowed: true };
}

function matchesRule(rule: string, path: string): boolean {
  const endAnchored = rule.endsWith('$');
  const pattern = (endAnchored ? rule.slice(0, -1) : rule).split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${pattern}${endAnchored ? '$' : ''}`).test(path);
}

export function createRobotsAwareRequest(options: {
  readonly request?: typeof fetch;
  readonly wait?: (milliseconds: number) => Promise<void>;
} = {}): typeof fetch {
  const request = options.request ?? fetch;
  const wait = options.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const policies = new Map<string, RobotsPolicy>();
  const nextAllowedAt = new Map<string, number>();

  const policyFor = async (url: URL): Promise<RobotsPolicy> => {
    const existing = policies.get(url.origin);
    if (existing) return existing;
    const robotsUrl = new URL('/robots.txt', url.origin);
    const response = await request(robotsUrl.href, {
      redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'text/plain', 'User-Agent': 'WeldCalculator-Research/1.0' },
    });
    if (response.status === 404) {
      const permissive = parseRobots('');
      policies.set(url.origin, permissive);
      return permissive;
    }
    if (!response.ok) throw new Error(`Robots policy unavailable for ${url.origin} (HTTP ${response.status}); source fetch blocked.`);
    const text = await response.text();
    if (text.length > 1_000_000) throw new Error(`Robots policy exceeds limit for ${url.origin}; source fetch blocked.`);
    const policy = parseRobots(text);
    policies.set(url.origin, policy);
    return policy;
  };

  return async (input, init) => {
    const url = input instanceof Request ? new URL(input.url) : input instanceof URL ? input : new URL(input);
    const approved = approvedSourceUrl(url.href);
    const policy = await policyFor(approved.url);
    if (!policy.allowed) throw new Error(`Robots policy disallows ${approved.url.href}.`);
    const match = policy.rules.filter((rule) => matchesRule(rule.path, approved.url.pathname))
      .sort((left, right) => right.path.length - left.path.length)[0];
    if (match && !match.allow) throw new Error(`Robots policy disallows ${approved.url.href}.`);
    const waitUntil = nextAllowedAt.get(approved.url.origin) ?? 0;
    const remaining = waitUntil - Date.now();
    if (remaining > 0) await wait(remaining);
    nextAllowedAt.set(approved.url.origin, Date.now() + policy.crawlDelayMs);
    return request(input, init);
  };
}