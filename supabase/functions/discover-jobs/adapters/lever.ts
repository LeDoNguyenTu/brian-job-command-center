import type { DiscoverySourceRecord } from '../core/types.ts';
import type { AdapterResult, FetchLike } from './types.ts';
import { fetchJson, normalizedJob, parseDate } from './common.ts';

export async function fetchLever(source: DiscoverySourceRecord, fetcher: FetchLike): Promise<AdapterResult> {
  const slug = new URL(source.canonicalUrl).pathname.split('/').filter(Boolean)[0];
  if (!slug) throw new Error('Lever site slug missing');
  const { data } = await fetchJson<Array<Record<string, unknown>>>(fetcher, `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`);
  const jobs = (Array.isArray(data) ? data : []).flatMap((raw) => {
    const title = typeof raw.text === 'string' ? raw.text : '';
    const jobUrl = typeof raw.hostedUrl === 'string' ? raw.hostedUrl : (typeof raw.applyUrl === 'string' ? raw.applyUrl : '');
    if (!title || !jobUrl) return [];
    const categories = raw.categories && typeof raw.categories === 'object' ? raw.categories as { location?: unknown; commitment?: unknown } : {};
    const createdAt = typeof raw.createdAt === 'number' ? new Date(raw.createdAt).toISOString() : parseDate(raw.createdAt);
    return [normalizedJob(source, {
      providerJobId: raw.id == null ? null : String(raw.id),
      url: jobUrl,
      applyUrl: typeof raw.applyUrl === 'string' ? raw.applyUrl : jobUrl,
      title,
      locations: typeof categories.location === 'string' ? [categories.location] : [],
      employmentType: typeof categories.commitment === 'string' ? categories.commitment : null,
      descriptionText: [raw.descriptionPlain, raw.additionalPlain].filter((v): v is string => typeof v === 'string').join(' '),
      postedAt: createdAt,
      availabilityEvidence: 'Present in live Lever postings feed',
    })];
  });
  return { source, status: 'success', jobs };
}
