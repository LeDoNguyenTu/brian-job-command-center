import type { DiscoverySourceRecord, MarketCode } from '../core/types.ts';
import type { AdapterResult, FetchLike } from './types.ts';
import { fetchJson, normalizedJob, parseDate, stripHtml } from './common.ts';

const MARKET_NAME: Record<MarketCode, string> = {
  SG: 'Singapore',
  VN: 'Vietnam',
  MY: 'Malaysia',
  TH: 'Thailand',
  ID: 'Indonesia',
  PH: 'Philippines',
};

type ManatalPage = {
  count?: number;
  next?: string | null;
  results?: Array<Record<string, unknown>>;
};

const tenantFromSource = (source: DiscoverySourceRecord) => {
  const url = new URL(source.canonicalUrl);
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  if (hostname === 'careers-page.com') return parts[0] ?? null;
  if (hostname.endsWith('.careers-page.com')) return hostname.slice(0, -'.careers-page.com'.length) || null;
  return null;
};

const stringField = (raw: Record<string, unknown>, name: string) => typeof raw[name] === 'string' ? String(raw[name]).trim() : '';

export async function fetchManatal(source: DiscoverySourceRecord, fetcher: FetchLike): Promise<AdapterResult> {
  const tenant = tenantFromSource(source);
  if (!tenant) throw new Error('Manatal career page tenant missing');

  const jobs: ReturnType<typeof normalizedJob>[] = [];
  const seen = new Set<string>();
  const markets = source.marketCodes.length ? source.marketCodes : ['SG' as const];
  const pageSize = 100;

  for (const market of [...new Set(markets)]) {
    for (let page = 1; page <= 3; page += 1) {
      const params = new URLSearchParams({
        country__icontains: MARKET_NAME[market],
        page_size: String(pageSize),
        page: String(page),
      });
      const endpoint = `https://api.manatal.com/open/v3/career-page/${encodeURIComponent(tenant)}/jobs/?${params.toString()}`;
      const { data } = await fetchJson<ManatalPage>(fetcher, endpoint);
      const results = data.results ?? [];

      for (const raw of results) {
        const id = raw.id == null ? '' : String(raw.id);
        const hash = stringField(raw, 'hash');
        const title = stringField(raw, 'position_name');
        if (!id || !title || seen.has(id)) continue;
        seen.add(id);

        const country = stringField(raw, 'country');
        const state = stringField(raw, 'state');
        const city = stringField(raw, 'city');
        const display = stringField(raw, 'location_display');
        const location = display || [city, state, country].filter(Boolean).join(', ');
        const contract = stringField(raw, 'contract_details').replace(/[_-]+/g, ' ').trim();
        const jobUrl = hash
          ? `https://www.careers-page.com/${encodeURIComponent(tenant)}/job/${encodeURIComponent(hash)}`
          : source.canonicalUrl;
        const validThrough = parseDate(raw.close_at);
        const closed = validThrough ? Date.parse(validThrough) < Date.now() : false;

        jobs.push(normalizedJob(source, {
          providerJobId: id,
          url: jobUrl,
          applyUrl: jobUrl,
          title,
          locations: location ? [location] : [],
          employmentType: contract || null,
          descriptionText: stripHtml(stringField(raw, 'description')),
          postedAt: parseDate(raw.open_at) ?? parseDate(raw.created_at),
          validThrough,
          availabilityStatus: closed ? 'closed' : 'verified_open',
          availabilityEvidence: closed
            ? 'Manatal Career Page API closing date has expired'
            : 'Present in live Manatal public Career Page API',
        }));
      }

      const count = typeof data.count === 'number' ? data.count : results.length;
      if (!data.next || results.length < pageSize || page * pageSize >= count) break;
    }
  }

  return { source, status: 'success', jobs };
}
