import type { DiscoverySourceRecord, MarketCode } from '../core/types.ts';
import { normalizeJobMarkets } from '../core/markets.ts';
import type { AdapterResult, FetchLike } from './types.ts';
import { absoluteUrl, fetchText, normalizedJob, stripHtml } from './common.ts';
import { parseJsonLdJobsFromHtml } from './jsonld.ts';

const LINK_HINT = /\/(?:jobs?|careers?|openings?|positions?|vacancies?|roles?)(?:\/|$)/i;
const APPLY_HINT = /\bapply(?:\s+now)?\b/i;
const MARKET_LABEL: Record<MarketCode, string> = { SG: 'Singapore', VN: 'Vietnam', MY: 'Malaysia', TH: 'Thailand', ID: 'Indonesia', PH: 'Philippines' };

const titleFromHtml = (html: string) => {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (h1) return stripHtml(h1);
  return stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
};

export async function fetchGenericEmployerHtml(source: DiscoverySourceRecord, fetcher: FetchLike): Promise<AdapterResult> {
  const root = new URL(source.canonicalUrl);
  const { text: indexHtml } = await fetchText(fetcher, source.canonicalUrl);
  const direct = parseJsonLdJobsFromHtml(source, indexHtml);
  if (direct.length) return { source, status: 'success', jobs: direct };

  const links: string[] = [];
  for (const match of indexHtml.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const candidate = absoluteUrl(match[1], source.canonicalUrl);
    let parsed: URL;
    try { parsed = new URL(candidate); } catch { continue; }
    if (parsed.origin !== root.origin) continue;
    if (!LINK_HINT.test(parsed.pathname) || /\/apply(?:\/|$)/i.test(parsed.pathname)) continue;
    if (!links.includes(parsed.toString())) links.push(parsed.toString());
    if (links.length >= 20) break;
  }

  const jobs: ReturnType<typeof normalizedJob>[] = [];
  for (const jobUrl of links) {
    let html = '';
    try { html = (await fetchText(fetcher, jobUrl)).text; } catch { continue; }
    const jsonLdJobs = parseJsonLdJobsFromHtml(source, html);
    if (jsonLdJobs.length) {
      jobs.push(...jsonLdJobs.map((job) => ({ ...job, canonicalUrl: job.canonicalUrl || jobUrl })));
      continue;
    }
    const title = titleFromHtml(html);
    if (!title) continue;
    const applyMatch = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].find((match) => APPLY_HINT.test(stripHtml(match[2])));
    const hasApplyForm = /<form\b[^>]*(?:action=["'][^"']+["'])?[^>]*>[\s\S]*?apply/i.test(html);
    if (!applyMatch && !hasApplyForm) continue;
    const plain = stripHtml(html).slice(0, 60_000);
    const codes = normalizeJobMarkets([plain]);
    const locations = codes.map((code) => MARKET_LABEL[code]);
    const lastSegment = new URL(jobUrl).pathname.split('/').filter(Boolean).at(-1) ?? null;
    jobs.push(normalizedJob(source, {
      providerJobId: lastSegment,
      url: jobUrl,
      applyUrl: applyMatch ? absoluteUrl(applyMatch[1], jobUrl) : jobUrl,
      title,
      locations,
      descriptionText: plain,
      postedAt: null,
      availabilityEvidence: 'Official employer detail page exposes a current application action',
    }));
  }
  return { source, status: 'success', jobs };
}
