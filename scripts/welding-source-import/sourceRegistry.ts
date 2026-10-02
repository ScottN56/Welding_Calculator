import type { ApprovedSource } from './types';

export const APPROVED_SOURCES: readonly ApprovedSource[] = [
  { manufacturer: 'Miller', domain: 'millerwelds.com', parser: 'miller-public-source-data', additionalHosts: ['prod.millerwelds.com'] },
  { manufacturer: 'Lincoln Electric', domain: 'lincolnelectric.com', parser: 'lincoln-pdf-setting-tables', additionalHosts: ['ch-delivery.lincolnelectric.com'] },
  { manufacturer: 'ESAB', domain: 'esab.com', parser: 'esab-recommended-welding-parameters-html' },
];

export function approvedSourceUrl(input: string): { url: URL; source: ApprovedSource } {
  let url: URL;
  try { url = new URL(input); }
  catch { throw new Error('Source URL must be an absolute HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('Only HTTPS manufacturer URLs without credentials or custom ports are allowed.');
  }
  const source = APPROVED_SOURCES.find((candidate) =>
    url.hostname === candidate.domain || url.hostname === `www.${candidate.domain}` || candidate.additionalHosts?.includes(url.hostname),
  );
  if (!source) throw new Error(`Source hostname is not approved: ${url.hostname}`);
  url.hash = '';
  return { url, source };
}