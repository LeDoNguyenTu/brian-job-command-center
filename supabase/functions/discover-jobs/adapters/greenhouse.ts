import type { DiscoverySourceRecord } from '../core/types.ts';
import type { AdapterResult, FetchLike } from './types.ts';
import { fetchJson, normalizedJob, stripHtml } from './common.ts';

export async function fetchGreenhouse(source: DiscoverySourceRecord, fetcher: FetchLike): Promise<AdapterResult> {
  const url = new URL(source.canonicalUrl);
  const slug = url.pathname.split('/').filter(Boolean)[0];
  if (!slug) throw new Error('Greenhouse board slug missing');
  const { data } = await fetchJson<{ jobs?: Array<Record<string, unknown>> }>(fetcher, `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`);
  const jobs = (data.jobs ?? []).flatMap((raw) => {
    const jobUrl = typeof raw.absolute_url === 'string' ? raw.absolute_url : '';
    const title = typeof raw.title === 'string' ? raw.title : '';
    if (!jobUrl || !title) return [];
    const location = raw.location && typeof raw.location === 'object' && typeof (raw.location as { name?: unknown }).name === 'string' ? String((raw.location as { name: string }).name) : '';
    return [normalizedJob(source, {
      providerJobId: raw.id == null ? null : String(raw.id),
      url: jobUrl,
      title,
      locations: location ? [location] : [],
      descriptionText: stripHtml(typeof raw.content === 'string' ? raw.content : ''),
      postedAt: null,
      availabilityEvidence: 'Present in live Greenhouse board feed',
    })];
  });
  return { source, status: 'success', jobs };
}
