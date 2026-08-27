import type { DiscoverySourceRecord } from '../core/types.ts';
import type { AdapterResult, FetchLike } from './types.ts';
import { absoluteUrl, fetchText, normalizedJob, parseDate, stripHtml } from './common.ts';

type JsonObject = Record<string, unknown>;

const collectJobPostings = (value: unknown): JsonObject[] => {
  if (Array.isArray(value)) return value.flatMap(collectJobPostings);
  if (!value || typeof value !== 'object') return [];
  const object = value as JsonObject;
  const own = object['@type'] === 'JobPosting' || (Array.isArray(object['@type']) && object['@type'].includes('JobPosting')) ? [object] : [];
  const graph = Array.isArray(object['@graph']) ? (object['@graph'] as unknown[]).flatMap(collectJobPostings) : [];
  return [...own, ...graph];
};

const locationStrings = (value: unknown): string[] => {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const address = (item as JsonObject).address;
    if (!address || typeof address !== 'object') return [];
    const a = address as JsonObject;
    const text = [a.streetAddress, a.addressLocality, a.addressRegion, a.addressCountry].filter((part): part is string => typeof part === 'string' && Boolean(part.trim())).join(', ');
    return text ? [text] : [];
  });
};

export function parseJsonLdJobsFromHtml(source: DiscoverySourceRecord, html: string): ReturnType<typeof normalizedJob>[] {
  const jobs: ReturnType<typeof normalizedJob>[] = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(regex)) {
    let parsed: unknown;
    try { parsed = JSON.parse(match[1].trim()); } catch { continue; }
    for (const raw of collectJobPostings(parsed)) {
      const title = typeof raw.title === 'string' ? raw.title : '';
      if (!title) continue;
      const identifier = raw.identifier;
      const id = typeof identifier === 'string' ? identifier : identifier && typeof identifier === 'object' && typeof (identifier as JsonObject).value === 'string' ? String((identifier as JsonObject).value) : null;
      const url = absoluteUrl(typeof raw.url === 'string' ? raw.url : source.canonicalUrl, source.canonicalUrl);
      const validThrough = parseDate(raw.validThrough);
      const closed = validThrough ? Date.parse(validThrough) < Date.now() : false;
      const hiring = raw.hiringOrganization && typeof raw.hiringOrganization === 'object' ? raw.hiringOrganization as JsonObject : {};
      jobs.push(normalizedJob(source, {
        providerJobId: id,
        url,
        applyUrl: url,
        company: typeof hiring.name === 'string' ? hiring.name : source.company,
        title,
        locations: locationStrings(raw.jobLocation),
        employmentType: Array.isArray(raw.employmentType) ? raw.employmentType.filter((v): v is string => typeof v === 'string').join(', ') : (typeof raw.employmentType === 'string' ? raw.employmentType : null),
        descriptionText: stripHtml(typeof raw.description === 'string' ? raw.description : ''),
        postedAt: parseDate(raw.datePosted),
        validThrough,
        availabilityStatus: closed ? 'closed' : 'verified_open',
        availabilityEvidence: closed ? 'JobPosting metadata validThrough has expired' : 'Current JobPosting JSON-LD on source page',
      }));
    }
  }
  return jobs;
}

export async function fetchJsonLd(source: DiscoverySourceRecord, fetcher: FetchLike): Promise<AdapterResult> {
  const { text } = await fetchText(fetcher, source.canonicalUrl);
  return { source, status: 'success', jobs: parseJsonLdJobsFromHtml(source, text) };
}
