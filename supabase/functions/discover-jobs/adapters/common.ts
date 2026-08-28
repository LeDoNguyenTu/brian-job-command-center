import { canonicalizeJobIdentity } from '../core/identity.ts';
import { normalizeJobMarkets } from '../core/markets.ts';
import type { DiscoverySourceRecord, MarketCode, NormalizedJob } from '../core/types.ts';
import type { FetchLike } from './types.ts';

const MAX_HTML_RESPONSE_BYTES = 2_000_000;
const MAX_JSON_RESPONSE_BYTES = 10_000_000;

export const stripHtml = (value = '') => value
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;|&#34;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/\s+/g, ' ')
  .trim();

export const parseDate = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

export async function fetchText(fetcher: FetchLike, url: string, init?: RequestInit, maxResponseBytes = MAX_HTML_RESPONSE_BYTES): Promise<{ text: string; status: number }> {
  const response = await fetcher(url, {
    ...init,
    headers: { 'User-Agent': 'Brian-Job-Command-Center/2.0', ...(init?.headers ?? {}) },
    signal: init?.signal ?? AbortSignal.timeout(12_000),
    redirect: 'follow',
  });
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxResponseBytes) throw new Error('Source response exceeds size limit');
  if (!response.ok) throw Object.assign(new Error(`Source returned ${response.status}`), { status: response.status });
  return { text, status: response.status };
}

export async function fetchJson<T>(fetcher: FetchLike, url: string, init?: RequestInit): Promise<{ data: T; status: number }> {
  const { text, status } = await fetchText(fetcher, url, init, MAX_JSON_RESPONSE_BYTES);
  return { data: JSON.parse(text) as T, status };
}

export const absoluteUrl = (value: string | null | undefined, base: string) => {
  if (!value) return base;
  try { return new URL(value, base).toString(); } catch { return base; }
};

export function normalizedJob(source: DiscoverySourceRecord, input: {
  providerJobId?: string | null;
  url: string;
  applyUrl?: string | null;
  company?: string | null;
  title: string;
  locations?: string[];
  employmentType?: string | null;
  descriptionText?: string | null;
  postedAt?: string | null;
  validThrough?: string | null;
  availabilityStatus?: NormalizedJob['availabilityStatus'];
  availabilityEvidence: string;
}): NormalizedJob {
  const locations = (input.locations ?? []).filter(Boolean);
  const identity = canonicalizeJobIdentity({
    url: input.url,
    provider: source.provider,
    providerJobId: input.providerJobId,
    company: input.company ?? source.company,
    title: input.title,
    location: locations.join(' | '),
  });
  const countryCodes = normalizeJobMarkets(locations);
  return {
    sourceId: source.id,
    sourceClass: source.sourceClass,
    provider: source.provider,
    providerJobId: identity.providerJobId,
    canonicalUrl: identity.canonicalUrl,
    applyUrl: absoluteUrl(input.applyUrl ?? input.url, input.url),
    company: input.company?.trim() || source.company,
    title: input.title.trim(),
    locations,
    countryCodes: countryCodes.length ? countryCodes : source.marketCodes as MarketCode[],
    employmentType: input.employmentType?.trim() || null,
    descriptionText: (input.descriptionText ?? '').slice(0, 60_000),
    postedAt: input.postedAt ?? null,
    validThrough: input.validThrough ?? null,
    availabilityStatus: input.availabilityStatus ?? 'verified_open',
    availabilityEvidence: input.availabilityEvidence.slice(0, 1000),
    retrievedAt: new Date().toISOString(),
  };
}

export const boundedError = (error: unknown) => error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
