import type { DiscoverySourceRecord } from '../core/types.ts';
import type { AdapterResult, FetchLike } from './types.ts';
import { fetchJson, normalizedJob, stripHtml } from './common.ts';

const localePattern = /^[a-z]{2}-[A-Z]{2}$/;

export async function fetchWorkday(source: DiscoverySourceRecord, fetcher: FetchLike): Promise<AdapterResult> {
  const board = new URL(source.canonicalUrl);
  const tenant = board.hostname.split('.')[0];
  const segments = board.pathname.split('/').filter(Boolean);
  const locale = segments[0] && localePattern.test(segments[0]) ? segments[0] : 'en-US';
  const site = localePattern.test(segments[0] ?? '') ? segments[1] : segments[0];
  if (!tenant || !site) throw new Error('Workday tenant or site missing');
  const cxsBase = `${board.origin}/wday/cxs/${encodeURIComponent(tenant)}/${encodeURIComponent(site)}`;
  const jobs: ReturnType<typeof normalizedJob>[] = [];
  const limit = 20;
  let total = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < Math.min(total, 200); offset += limit) {
    const { data } = await fetchJson<{ total?: number; jobPostings?: Array<Record<string, unknown>> }>(fetcher, `${cxsBase}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: source.canonicalUrl },
      body: JSON.stringify({ appliedFacets: {}, limit, offset, searchText: '' }),
    });
    const postings = data.jobPostings ?? [];
    if (offset === 0 && typeof data.total === 'number') total = data.total;
    if (!postings.length) break;
    for (const posting of postings) {
      const title = typeof posting.title === 'string' ? posting.title : '';
      const externalPath = typeof posting.externalPath === 'string' ? posting.externalPath : '';
      if (!title || !externalPath) continue;
      let detail: Record<string, unknown> = {};
      try {
        const detailResult = await fetchJson<Record<string, unknown>>(fetcher, `${cxsBase}${externalPath}`, { headers: { Referer: source.canonicalUrl } });
        detail = detailResult.data;
      } catch {
        detail = {};
      }
      const info = detail.jobPostingInfo && typeof detail.jobPostingInfo === 'object' ? detail.jobPostingInfo as Record<string, unknown> : {};
      const match = externalPath.match(/(?:_|\/)([A-Za-z]+-\d+)(?:\/)?$/);
      const publicUrl = `${board.origin}/${locale}/${site}${externalPath}`;
      const location = typeof info.location === 'string' ? info.location : (typeof posting.locationsText === 'string' ? posting.locationsText : '');
      jobs.push(normalizedJob(source, {
        providerJobId: match?.[1] ?? null,
        url: publicUrl,
        title,
        locations: location ? [location] : [],
        employmentType: typeof info.timeType === 'string' ? info.timeType : null,
        descriptionText: stripHtml(typeof info.jobDescription === 'string' ? info.jobDescription : ''),
        postedAt: null,
        availabilityEvidence: 'Present in live Workday Candidate Experience Service feed',
      }));
    }
    if (postings.length < limit || offset + postings.length >= total) break;
  }
  return { source, status: 'success', jobs };
}
