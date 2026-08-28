import type { DiscoverySourceRecord } from '../core/types.ts';
import type { AdapterResult, FetchLike } from './types.ts';
import { fetchJson, normalizedJob, parseDate, stripHtml } from './common.ts';

export async function fetchAshby(source: DiscoverySourceRecord, fetcher: FetchLike): Promise<AdapterResult> {
  const slug = new URL(source.canonicalUrl).pathname.split('/').filter(Boolean)[0];
  if (!slug) throw new Error('Ashby board name missing');
  const { data } = await fetchJson<{ jobs?: Array<Record<string, unknown>> }>(fetcher, `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`);
  const jobs = (data.jobs ?? []).flatMap((raw) => {
    const title = typeof raw.title === 'string' ? raw.title : '';
    const jobUrl = typeof raw.jobUrl === 'string' ? raw.jobUrl : (typeof raw.applyUrl === 'string' ? raw.applyUrl : '');
    if (!title || !jobUrl || raw.isListed === false) return [];
    const secondary = Array.isArray(raw.secondaryLocations) ? raw.secondaryLocations.flatMap((loc) => loc && typeof loc === 'object' && typeof (loc as { location?: unknown }).location === 'string' ? [String((loc as { location: string }).location)] : []) : [];
    return [normalizedJob(source, {
      providerJobId: raw.id == null ? null : String(raw.id),
      url: jobUrl,
      applyUrl: typeof raw.applyUrl === 'string' ? raw.applyUrl : jobUrl,
      title,
      locations: [typeof raw.location === 'string' ? raw.location : '', ...secondary].filter(Boolean),
      employmentType: typeof raw.employmentType === 'string' ? raw.employmentType : null,
      descriptionText: stripHtml(typeof raw.descriptionPlain === 'string' ? raw.descriptionPlain : (typeof raw.descriptionHtml === 'string' ? raw.descriptionHtml : '')),
      postedAt: parseDate(raw.publishedAt),
      availabilityEvidence: 'Present in live Ashby public job board API',
    })];
  });
  return { source, status: 'success', jobs };
}
