import type { DiscoverySourceRecord } from '../core/types.ts';
import type { AdapterResult, FetchLike } from './types.ts';
import { fetchJson, normalizedJob, parseDate, stripHtml } from './common.ts';

const descriptionFromPosting = (raw: Record<string, unknown>) => {
  const sections = raw.jobAd && typeof raw.jobAd === 'object' && (raw.jobAd as { sections?: unknown }).sections && typeof (raw.jobAd as { sections: unknown }).sections === 'object'
    ? (raw.jobAd as { sections: Record<string, unknown> }).sections : {};
  return Object.values(sections).flatMap((section) => section && typeof section === 'object' && typeof (section as { text?: unknown }).text === 'string' ? [stripHtml(String((section as { text: string }).text))] : []).join(' ');
};

export async function fetchSmartRecruiters(source: DiscoverySourceRecord, fetcher: FetchLike): Promise<AdapterResult> {
  const company = new URL(source.canonicalUrl).pathname.split('/').filter(Boolean)[0];
  if (!company) throw new Error('SmartRecruiters company identifier missing');
  const jobs: ReturnType<typeof normalizedJob>[] = [];
  const pageSize = 100;
  for (let offset = 0; offset < 300; offset += pageSize) {
    const listUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings?limit=${pageSize}&offset=${offset}&destination=PUBLIC`;
    const { data } = await fetchJson<{ totalFound?: number; content?: Array<{ id?: string }> }>(fetcher, listUrl);
    const items = data.content ?? [];
    for (const item of items.slice(0, 100)) {
      if (!item.id) continue;
      const { data: detail } = await fetchJson<Record<string, unknown>>(fetcher, `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings/${encodeURIComponent(item.id)}`);
      const title = typeof detail.name === 'string' ? detail.name : '';
      const jobUrl = typeof detail.jobAdUrl === 'string' ? detail.jobAdUrl : source.canonicalUrl;
      const loc = detail.location && typeof detail.location === 'object' ? detail.location as { city?: unknown; region?: unknown; country?: unknown } : {};
      const location = [loc.city, loc.region, loc.country].filter((v): v is string => typeof v === 'string' && Boolean(v.trim())).join(', ');
      const employment = detail.typeOfEmployment && typeof detail.typeOfEmployment === 'object' && typeof (detail.typeOfEmployment as { label?: unknown }).label === 'string' ? String((detail.typeOfEmployment as { label: string }).label) : null;
      if (!title) continue;
      jobs.push(normalizedJob(source, {
        providerJobId: String(detail.id ?? item.id),
        url: jobUrl,
        applyUrl: typeof detail.applyUrl === 'string' ? detail.applyUrl : jobUrl,
        title,
        locations: location ? [location] : [],
        employmentType: employment,
        descriptionText: descriptionFromPosting(detail),
        postedAt: parseDate(detail.releasedDate),
        availabilityEvidence: 'Present in live SmartRecruiters public Posting API',
      }));
    }
    const total = typeof data.totalFound === 'number' ? data.totalFound : items.length;
    if (items.length < pageSize || offset + items.length >= total) break;
  }
  return { source, status: 'success', jobs };
}
