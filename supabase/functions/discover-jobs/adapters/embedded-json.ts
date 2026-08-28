import type { DiscoverySourceRecord } from '../core/types.ts';
import type { AdapterResult, FetchLike } from './types.ts';
import { absoluteUrl, fetchText, normalizedJob, parseDate, stripHtml } from './common.ts';

type Obj = Record<string, unknown>;

const stringField = (obj: Obj, names: string[]) => {
  for (const name of names) if (typeof obj[name] === 'string' && String(obj[name]).trim()) return String(obj[name]);
  return null;
};

const findCandidates = (root: unknown) => {
  const found: Obj[] = [];
  const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  let visited = 0;
  while (stack.length && visited < 5000) {
    const { value, depth } = stack.pop()!;
    visited += 1;
    if (depth > 10 || value == null) continue;
    if (Array.isArray(value)) {
      for (const child of value.slice(0, 500)) stack.push({ value: child, depth: depth + 1 });
      continue;
    }
    if (typeof value !== 'object') continue;
    const obj = value as Obj;
    const title = stringField(obj, ['title', 'jobTitle', 'name', 'position']);
    const url = stringField(obj, ['url', 'jobUrl', 'absolute_url', 'job_url', 'applyUrl', 'apply_url']);
    const supporting = stringField(obj, ['id', 'jobId', 'requisitionId', 'location', 'description', 'employmentType']);
    if (title && url && supporting) found.push(obj);
    for (const child of Object.values(obj)) stack.push({ value: child, depth: depth + 1 });
  }
  return found.slice(0, 200);
};

export async function fetchEmbeddedJson(source: DiscoverySourceRecord, fetcher: FetchLike): Promise<AdapterResult> {
  const { text } = await fetchText(fetcher, source.canonicalUrl);
  const scripts = [...text.matchAll(/<script[^>]*(?:type=["']application\/json["']|id=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/gi)];
  const jobs: ReturnType<typeof normalizedJob>[] = [];
  const seen = new Set<string>();
  for (const script of scripts.slice(0, 20)) {
    let parsed: unknown;
    try { parsed = JSON.parse(script[1]); } catch { continue; }
    for (const raw of findCandidates(parsed)) {
      const title = stringField(raw, ['title', 'jobTitle', 'name', 'position']);
      const path = stringField(raw, ['url', 'jobUrl', 'absolute_url', 'job_url', 'applyUrl', 'apply_url']);
      if (!title || !path) continue;
      const url = absoluteUrl(path, source.canonicalUrl);
      if (seen.has(url)) continue;
      seen.add(url);
      const id = stringField(raw, ['id', 'jobId', 'requisitionId', 'reqId']);
      const location = stringField(raw, ['location', 'locationName', 'city']);
      jobs.push(normalizedJob(source, {
        providerJobId: id,
        url,
        applyUrl: absoluteUrl(stringField(raw, ['applyUrl', 'apply_url']) ?? url, url),
        title,
        locations: location ? [location] : [],
        employmentType: stringField(raw, ['employmentType', 'commitment', 'jobType']),
        descriptionText: stripHtml(stringField(raw, ['description', 'descriptionText', 'summary']) ?? ''),
        postedAt: parseDate(stringField(raw, ['datePosted', 'postedAt', 'publishedAt'])),
        validThrough: parseDate(stringField(raw, ['validThrough', 'closingDate'])),
        availabilityEvidence: 'Structured job record in official employer application JSON',
      }));
    }
  }
  return { source, status: 'success', jobs };
}
