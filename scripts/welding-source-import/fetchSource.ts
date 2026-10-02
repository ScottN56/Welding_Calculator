import { approvedSourceUrl } from './sourceRegistry';
import type { RetrievedSource } from './types';

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

export async function fetchSource(input: string, request: typeof fetch = fetch): Promise<RetrievedSource> {
  const initial = approvedSourceUrl(input);
  let current = initial.url;
  const signal = AbortSignal.timeout(20_000);

  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const approved = approvedSourceUrl(current.href);
    if (approved.source.manufacturer !== initial.source.manufacturer) {
      throw new Error('Redirect to a different manufacturer is not allowed.');
    }
    const response = await request(current, {
      redirect: 'manual',
      signal,
      headers: { Accept: initial.source.manufacturer === 'Lincoln Electric' ? 'application/pdf' : initial.source.manufacturer === 'Miller' ? 'text/html, application/pdf' : 'text/html', 'User-Agent': 'WeldCalculator-SourceReview/1.0' },
    });
    if (REDIRECT_CODES.has(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Manufacturer redirect has no Location header.');
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Official source returned HTTP ${response.status}. No data was imported.`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    const isPdf = /^application\/pdf(?:;|$)/i.test(contentType);
    const isHtml = /^text\/html(?:;|$)/i.test(contentType);
    const supported = initial.source.manufacturer === 'Miller' ? isPdf || isHtml : initial.source.manufacturer === 'Lincoln Electric' ? isPdf : isHtml;
    if (!supported) {
      await response.body?.cancel();
      throw new Error('Unsupported manufacturer source content type. Expected ESAB HTML, Lincoln PDF, or Miller HTML/PDF.');
    }
    const charset = /charset\s*=\s*["']?([^;"'\s]+)/i.exec(contentType)?.[1];
    if (!isPdf && charset && !/^(?:utf-8|utf8)$/i.test(charset)) {
      await response.body?.cancel();
      throw new Error(`Unsupported source character encoding: ${charset}`);
    }
    if (!response.body) throw new Error('Official source response is empty.');
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        total += chunk.value.byteLength;
        if (total > MAX_SOURCE_BYTES) throw new Error('Official source exceeds the 5 MiB download limit.');
        chunks.push(chunk.value);
      }
    } catch (error) {
      await reader.cancel();
      throw error;
    } finally { reader.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    if (isPdf && bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('Manufacturer response is not a PDF document.');
    return {
      url: current.href,
      manufacturer: initial.source.manufacturer,
      retrievedAt: new Date().toISOString(),
      bytes,
      html: isPdf ? '' : new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      mediaType: isPdf ? 'pdf' : 'html',
    };
  }
  throw new Error('Too many manufacturer redirects. No data was imported.');
}