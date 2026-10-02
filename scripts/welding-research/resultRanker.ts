import { filterAndDeduplicateResults } from './sourceFilter';
import type { ResearchCandidate, ResearchFilters, ResearchRank, ResearchSourceType, ResearchUsefulness, SearchResult } from './types';

const FIELD_SIGNALS: readonly [string, RegExp][] = [
  ['material thickness', /\b(?:material\s+)?thickness\b/i],
  ['wire diameter', /\bwire\s+(?:diameter|size)\b/i],
  ['electrode diameter', /\belectrode\s+(?:diameter|size)\b/i],
  ['voltage', /\bvoltage\b|\bvolts?\b/i],
  ['amperage/current', /\bamperage\b|\bcurrent\b|\bamps?\b/i],
  ['wire feed speed', /\bwire[ -]?feed(?:\s+speed)?\b|\bWFS\b|\bIPM\b|\bm\/min\b/i],
  ['shielding gas', /\bshielding\s+gas\b/i],
  ['gas flow', /\bgas\s+flow\b|\bCFH\b|\bL\/min\b/i],
  ['polarity', /\bpolarity\b/i],
  ['transfer mode', /\btransfer\s+mode\b/i],
  ['position', /\bposition\b/i],
];

function detectedProcess(text: string): ResearchCandidate['detectedProcess'] {
  const processes = new Set<NonNullable<ResearchCandidate['detectedProcess']>>();
  if (/\bGMAW\b|\bMIG\b|\bMAG\b/i.test(text)) processes.add('GMAW');
  if (/\bFCAW\b|flux[ -]?cored|innershield/i.test(text)) processes.add('FCAW');
  if (/\bGTAW\b|\bTIG\b/i.test(text)) processes.add('GTAW');
  if (/\bSMAW\b|\bstick\b/i.test(text)) processes.add('SMAW');
  return processes.size === 1 ? [...processes][0]! : null;
}

function detectedMaterial(text: string): string | null {
  if (/stainless\s+steel/i.test(text)) return 'stainless-steel';
  if (/alumini?um/i.test(text)) return 'aluminum';
  if (/mild\s+steel|carbon\s+steel/i.test(text)) return 'carbon-steel';
  return null;
}

function sourceType(result: SearchResult): ResearchSourceType {
  const text = `${result.title} ${result.snippet} ${result.url}`;
  if (/\.pdf(?:$|[?#])/i.test(result.url) || /pdf/i.test(result.mime ?? '') || /pdf/i.test(result.fileFormat ?? '')) return 'official PDF/manual';
  if (/technical data sheet|datasheet|product data sheet/i.test(text)) return 'technical data sheet';
  if (/parameter chart|application chart|welding parameters/i.test(text)) return 'parameter chart';
  if (/welding guide|how to|guide/i.test(text)) return 'welding guide';
  if (/calculator/i.test(text)) return 'calculator';
  if (/product/i.test(text)) return 'product data';
  if (/manual|resource/i.test(text)) return 'official PDF/manual';
  return 'manufacturer page';
}

function classifyUsefulness(text: string, fields: readonly string[], official: boolean): ResearchUsefulness {
  if (!official) return 'unsupported';
  if (/machine\s+(?:capabilit|operating|control)|operating ranges/i.test(text)) return 'technical-reference';
  if (/recommended welding parameters|suggested settings|application chart|parameter chart/i.test(text) && fields.length >= 3) return 'likely-parameter-data';
  if (/technical data sheet|datasheet|welding guide|electrode selection|filler metal/i.test(text)) return 'technical-reference';
  if (/calculator|product overview/i.test(text)) return 'overview';
  if (fields.length > 0 || /manual|product/i.test(text)) return 'general-guide';
  return 'unsupported';
}

function scoreResult(result: SearchResult, usefulness: ResearchUsefulness, fields: readonly string[]): { score: number; rank: ResearchRank; reasons: string[] } {
  const text = `${result.title} ${result.snippet} ${result.url}`;
  let score = 0;
  const reasons: string[] = ['Official manufacturer domain'];
  score += 35;
  if (/technical data sheet|datasheet|manual|\.pdf/i.test(text)) { score += 18; reasons.push('Technical document or official PDF/manual'); }
  if (/parameter chart|application chart|recommended welding parameters|suggested settings/i.test(text)) { score += 25; reasons.push('Parameter/application table signal'); }
  if (fields.length) { score += Math.min(fields.length * 4, 20); reasons.push(`${fields.length} explicit field label signal(s)`); }
  if (/welding guide|how to/i.test(text)) { score += 8; reasons.push('Official welding guide'); }
  if (/calculator|product overview|case stud(y|ies)|news/i.test(text)) { score -= 20; reasons.push('Overview/marketing content is lower priority'); }
  if (usefulness === 'general-guide' && fields.length === 0) { score -= 20; reasons.push('No explicit parameter field labels detected'); }
  if (usefulness === 'unsupported') score -= 20;
  score = Math.max(0, Math.min(100, score));
  const rank: ResearchRank = score >= 82 && usefulness === 'likely-parameter-data' ? 'excellent'
    : score >= 62 && usefulness !== 'unsupported' ? 'good'
      : score >= 30 ? 'manual-review' : 'unsupported';
  return { score, rank, reasons };
}

export function rankSearchResults(results: readonly SearchResult[], filters: ResearchFilters, options: { readonly includeUntrusted?: boolean } = {}): readonly ResearchCandidate[] {
  const official = filterAndDeduplicateResults(results, {
    ...(filters.manufacturer ? { manufacturer: filters.manufacturer } : {}),
    ...(options.includeUntrusted ? { includeUntrusted: true } : {}),
  });
  const candidates = official.map(({ result, manufacturer, trust }) => {
    const text = `${result.title} ${result.snippet}`;
    const detectedFields = FIELD_SIGNALS.flatMap(([label, pattern]) => pattern.test(text) ? [label] : []);
    const sourceKind = sourceType(result);
    const usefulness = classifyUsefulness(`${text} ${sourceKind}`, detectedFields, trust === 'official');
    const ranking = scoreResult(result, usefulness, detectedFields);
    return {
      title: result.title, manufacturer, url: result.url, snippet: result.snippet,
      detectedProcess: detectedProcess(text), detectedMaterial: detectedMaterial(text), sourceType: sourceKind,
      trust, usefulness, rank: ranking.rank, score: ranking.score, rankReasons: ranking.reasons,
      detectedFields,
      eligibleForImporter: trust === 'official' && (ranking.rank === 'excellent' || ranking.rank === 'good') &&
        usefulness === 'likely-parameter-data' && ['official PDF/manual', 'technical data sheet', 'parameter chart', 'product data'].includes(sourceKind),
    } satisfies ResearchCandidate;
  });
  return candidates
    .filter((candidate) => !filters.process || candidate.detectedProcess === filters.process)
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url));
}