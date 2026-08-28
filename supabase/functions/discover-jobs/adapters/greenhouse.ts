import { normalizeJobMarkets } from '../core/markets.ts';
import type { DiscoverySourceRecord } from '../core/types.ts';
import type { AdapterResult, FetchLike } from './types.ts';
import { fetchJson, normalizedJob, parseDate, stripHtml } from './common.ts';

const locationName = (raw: Record<string, unknown>) => raw.location
  && typeof raw.location === 'object'
  && typeof (raw.location as { name?: unknown }).name === 'string'
    ? String((raw.location as { name: string }).name)
    : '';

export async function fetchGreenhouse(source: DiscoverySourceRecord, fetcher: FetchLike): Promise<AdapterResult> {
  const url = new URL(source.canonicalUrl);
  const slug = url.pathname.split('/').filter(Boolean)[0];
  if (!slug) throw new Error('Greenhouse board slug missing');

  const listUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs`;
  const { data } = await fetchJson<{ jobs?: Array<Record<string, unknown>> }>(fetcher, listUrl);
  const marketSet = new Set(source.marketCodes);
  const candidates = (data.jobs ?? []).filter((raw) => {
    const location = locationName(raw);
    if (!location) return false;
    return normalizeJobMarkets([location]).some((code) => marketSet.has(code));
  });

  const jobs: ReturnType<typeof normalizedJob>[] = [];
  for (const listing of candidates) {
    const id = listing.id == null ? '' : String(listing.id);
    if (!id) continue;
    const { data: detail } = await fetchJson<Record<string, unknown>>(
      fetcher,
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(id)}`,
    );
    const title = typeof detail.title === 'string' ? detail.title : (typeof listing.title === 'string' ? listing.title : '');
    const jobUrl = typeof detail.absolute_url === 'string'
      ? detail.absolute_url
      : (typeof listing.absolute_url === 'string' ? listing.absolute_url : '');
    if (!title || !jobUrl) continue;
    const location = locationName(detail) || locationName(listing);
    jobs.push(normalizedJob(source, {
      providerJobId: id,
      url: jobUrl,
      title,
      locations: location ? [location] : [],
      descriptionText: stripHtml(typeof detail.content === 'string' ? detail.content : ''),
      postedAt: parseDate(detail.first_published),
      availabilityEvidence: 'Present in live Greenhouse board feed and detail endpoint',
    }));
  }
  return { source, status: 'success', jobs };
}
