import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { fetchSourceJobs } from './adapters/index.ts';
import { fetchText } from './adapters/common.ts';
import { assessEligibility } from './core/eligibility.ts';
import { classifyRecruitmentSource } from './core/source-classifier.ts';
import type { DiscoverySourceRecord, MarketCode, NormalizedJob } from './core/types.ts';
import { planDiscoveryRun, reconcileSourceSnapshot, type DiscoveryAction } from './pipeline/reconcile.ts';
import { proposeDiscoverySource } from './pipeline/source-discovery.ts';

const allowedOrigins = new Set([
  'https://brian-job.vercel.app',
  'http://terminal.local:4173',
  'http://localhost:4173',
]);
const isAllowedOrigin = (origin: string) => allowedOrigins.has(origin) || /^https:\/\/brian-job-command-center(?:-[a-z0-9]+)*\.vercel\.app$/i.test(origin);
const corsHeaders = (request: Request) => ({
  'Access-Control-Allow-Origin': isAllowedOrigin(request.headers.get('origin') || '') ? request.headers.get('origin')! : 'https://brian-job.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Vary': 'Origin',
});
const json = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });

const SEARCH_PROVIDERS = ['tavily', 'exa', 'firecrawl', 'brave', 'serpapi', 'serper'] as const;
type SearchProvider = typeof SEARCH_PROVIDERS[number];
type SearchHit = { title: string; url: string; snippet: string };

type Settings = {
  discovery_enabled: boolean;
  discovery_time: string;
  discovery_timezone: string;
  discovery_markets?: MarketCode[];
  discovery_web_search_enabled: boolean;
  discovery_web_search_configured: boolean;
  discovery_search_queries?: string[];
  discovery_target_role_keywords?: string[];
  discovery_excluded_title_keywords?: string[];
  discovery_max_required_years: number;
  discovery_provider_order?: SearchProvider[];
  discovery_provider_status?: unknown;
  last_scheduled_discovery_date: string | null;
};

type ProviderKeys = Partial<Record<SearchProvider, string>>;

const MARKET_NAME: Record<MarketCode, string> = {
  SG: 'Singapore', VN: 'Vietnam', MY: 'Malaysia', TH: 'Thailand', ID: 'Indonesia', PH: 'Philippines',
};

function localClock(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${value.year}-${value.month}-${value.day}`, minutes: Number(value.hour) * 60 + Number(value.minute) };
}

const requiredExperienceYears = (text: string) => {
  let required = 0;
  for (const sentence of text.split(/[.!?\n]+/)) {
    if (/preferred|nice to have|bonus|advantage|plus but not required/i.test(sentence)) continue;
    for (const pattern of [
      /\b(?:minimum(?: of)?|at least|requires?|required)\s*(\d+)\s*\+?\s*(?:years?|yrs?)\b/gi,
      /\b(\d+)\s*\+\s*(?:years?|yrs?|yoe)\b/gi,
      /\b(\d+)\s*(?:years?|yrs?|yoe)\s+(?:of\s+)?(?:professional|commercial|industry|relevant|work|hands-on)\s+experience\b/gi,
    ]) for (const match of sentence.matchAll(pattern)) required = Math.max(required, Number(match[1]) || 0);
  }
  return required;
};

const mandatoryLanguages = (text: string) => {
  const languages = ['Mandarin', 'Chinese', 'Japanese', 'Korean', 'Thai', 'Bahasa Indonesia', 'Malay', 'Vietnamese', 'English'];
  return languages.filter((language) => new RegExp(`(?:${language}).{0,40}(?:required|mandatory|must|essential)|(?:required|mandatory|must|essential).{0,40}(?:${language})`, 'i').test(text));
};

const sponsorshipRestriction = (text: string): 'unknown' | 'citizen_pr_only' | 'no_sponsorship' | 'sponsorship_available' => {
  if (/(citizen|citizenship|permanent resident|\bpr\b).{0,50}(only|required|must)|(?:only|must be).{0,50}(citizen|permanent resident|\bpr\b)/i.test(text)) return 'citizen_pr_only';
  if (/(?:no|without)\s+(?:visa\s+)?sponsorship|unable to sponsor|will not sponsor/i.test(text)) return 'no_sponsorship';
  if (/visa sponsorship|work pass sponsorship|sponsorship available/i.test(text)) return 'sponsorship_available';
  return 'unknown';
};

const classifyMatch = (job: NormalizedJob) => {
  const text = `${job.title} ${job.descriptionText}`.toLowerCase();
  const track = /security|cyber|soc|vulnerab|penetration/.test(text) ? 'Security'
    : /cloud|infrastructure|network|system administrator|devops|sre/.test(text) ? 'Cloud'
    : /software|developer|engineer|backend|frontend|full.?stack|programmer/.test(text) ? 'Software'
    : /support|help.?desk|technician|operations/.test(text) ? 'IT Support' : 'Other';
  const skills = [
    ['Python', /\bpython\b/], ['JavaScript', /javascript|typescript|node\.?js/], ['React', /\breact\b/],
    ['APIs', /\bapi\b|restful/], ['Cloud', /aws|azure|gcp|cloud/], ['Security', /security|cyber|soc|vulnerab/],
    ['SQL', /\bsql\b|postgres|mysql/], ['Support', /support|help.?desk|troubleshoot/],
  ].filter(([, pattern]) => (pattern as RegExp).test(text)).map(([skill]) => skill as string).slice(0, 6);
  const earlyCareer = /graduate|junior|entry.?level|associate|trainee/.test(text);
  const years = requiredExperienceYears(text);
  const score = Math.max(45, Math.min(94, 58 + skills.length * 5 + (earlyCareer ? 12 : 0) - Math.max(0, years - 1) * 7));
  return { track, skills, score, level: score >= 80 ? 'Strong' : 'Review' };
};

function mapSource(row: Record<string, unknown>): DiscoverySourceRecord {
  return {
    id: String(row.id), company: String(row.company), displayName: String(row.display_name), canonicalUrl: String(row.canonical_url),
    employerHost: row.employer_host ? String(row.employer_host) : null,
    sourceClass: row.source_class as DiscoverySourceRecord['sourceClass'], provider: String(row.provider), adapter: String(row.adapter),
    marketCodes: (Array.isArray(row.market_codes) ? row.market_codes : ['SG']) as MarketCode[],
    trustLevel: row.trust_level as DiscoverySourceRecord['trustLevel'],
    adapterConfig: row.adapter_config && typeof row.adapter_config === 'object' ? row.adapter_config as Record<string, unknown> : {},
  };
}

const sourceRoot = (value: string) => {
  const url = new URL(value);
  const parts = url.pathname.split('/').filter(Boolean);
  if (/greenhouse\.io$/i.test(url.hostname) || /lever\.co$/i.test(url.hostname) || /ashbyhq\.com$/i.test(url.hostname) || /smartrecruiters\.com$/i.test(url.hostname)) {
    url.pathname = parts[0] ? `/${parts[0]}` : '/'; url.search = ''; url.hash = ''; return url.toString().replace(/\/$/, '');
  }
  if (/myworkdayjobs\.com$/i.test(url.hostname)) {
    const locale = /^[a-z]{2}-[A-Z]{2}$/.test(parts[0] ?? '') ? parts[0] : 'en-US';
    const site = /^[a-z]{2}-[A-Z]{2}$/.test(parts[0] ?? '') ? parts[1] : parts[0];
    if (site) { url.pathname = `/${locale}/${site}`; url.search = ''; url.hash = ''; return url.toString().replace(/\/$/, ''); }
  }
  const index = parts.findIndex((part) => /^(jobs?|careers?|openings?|positions?|vacancies?|roles?)$/i.test(part));
  if (index >= 0) url.pathname = '/' + parts.slice(0, index + 1).join('/');
  url.search = ''; url.hash = '';
  return url.toString().replace(/\/$/, '');
};

async function searchProvider(provider: SearchProvider, query: string, apiKey: string): Promise<SearchHit[]> {
  if (provider === 'tavily') {
    const response = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: apiKey, query, max_results: 10, search_depth: 'basic' }), signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Tavily returned ${response.status}`);
    const data = await response.json();
    return (data.results ?? []).map((r: Record<string, unknown>) => ({ title: String(r.title ?? ''), url: String(r.url ?? ''), snippet: String(r.content ?? '') })).filter((r: SearchHit) => r.url);
  }
  if (provider === 'exa') {
    const response = await fetch('https://api.exa.ai/search', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify({ query, numResults: 10, useAutoprompt: true }), signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Exa returned ${response.status}`);
    const data = await response.json();
    return (data.results ?? []).map((r: Record<string, unknown>) => ({ title: String(r.title ?? ''), url: String(r.url ?? ''), snippet: String(r.text ?? '') })).filter((r: SearchHit) => r.url);
  }
  if (provider === 'brave') {
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`, { headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey }, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Brave returned ${response.status}`);
    const data = await response.json();
    return (data.web?.results ?? []).map((r: Record<string, unknown>) => ({ title: String(r.title ?? ''), url: String(r.url ?? ''), snippet: String(r.description ?? '') })).filter((r: SearchHit) => r.url);
  }
  if (provider === 'serper') {
    const response = await fetch('https://google.serper.dev/search', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey }, body: JSON.stringify({ q: query, num: 10 }), signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Serper returned ${response.status}`);
    const data = await response.json();
    return (data.organic ?? []).map((r: Record<string, unknown>) => ({ title: String(r.title ?? ''), url: String(r.link ?? ''), snippet: String(r.snippet ?? '') })).filter((r: SearchHit) => r.url);
  }
  if (provider === 'serpapi') {
    const response = await fetch(`https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`SerpApi returned ${response.status}`);
    const data = await response.json();
    return (data.organic_results ?? []).map((r: Record<string, unknown>) => ({ title: String(r.title ?? ''), url: String(r.link ?? ''), snippet: String(r.snippet ?? '') })).filter((r: SearchHit) => r.url);
  }
  const response = await fetch('https://api.firecrawl.dev/v1/search', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ query, limit: 10 }), signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Firecrawl returned ${response.status}`);
  const data = await response.json();
  const items = Array.isArray(data.data) ? data.data : (data.data?.web ?? []);
  return items.map((r: Record<string, unknown>) => ({ title: String(r.title ?? ''), url: String(r.url ?? ''), snippet: String(r.description ?? r.markdown ?? '') })).filter((r: SearchHit) => r.url);
}

async function discoverSources(service: ReturnType<typeof createClient>, settings: Settings, providerKeys: ProviderKeys, dryRun: boolean) {
  const markets = settings.discovery_markets?.length ? settings.discovery_markets : ['SG'];
  const configured = (settings.discovery_provider_order?.length ? settings.discovery_provider_order : [...SEARCH_PROVIDERS])
    .filter((provider, index, list) => SEARCH_PROVIDERS.includes(provider) && list.indexOf(provider) === index && providerKeys[provider]);
  if (!settings.discovery_web_search_enabled || !configured.length) return { learned: 0, quarantined: 0, attempts: [] as unknown[] };

  const baseQueries = settings.discovery_search_queries?.filter(Boolean) ?? [];
  const generated = markets.flatMap((market) => [
    `graduate junior software cybersecurity IT support cloud jobs ${MARKET_NAME[market]} company careers`,
    `site:myworkdayjobs.com OR site:greenhouse.io OR site:lever.co OR site:ashbyhq.com ${MARKET_NAME[market]} software security`,
  ]);
  const queries = [...new Set([...baseQueries, ...generated])].slice(0, 10);
  let learned = 0, quarantined = 0;
  const attempts: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (const provider of configured.slice(0, 3)) {
    const key = providerKeys[provider]!;
    let providerHits = 0;
    try {
      for (const query of queries) {
        const hits = await searchProvider(provider, query, key);
        for (const hit of hits.slice(0, 10)) {
          if (providerHits >= 30) break;
          let root: string;
          try { root = sourceRoot(hit.url); } catch { continue; }
          if (seen.has(root)) continue;
          seen.add(root); providerHits += 1;
          let html = '';
          const initial = classifyRecruitmentSource({ url: root });
          let verifiedEmployerHosts: string[] | undefined;
          if (initial.sourceClass === 'quarantine') {
            try {
              html = (await fetchText(fetch, root)).text;
              const hasStrongEmployerEvidence = /@type["']?\s*:\s*["']JobPosting["']/i.test(html)
                || (/(?:careers?|jobs?|openings?)/i.test(new URL(root).pathname) && /\bapply(?:\s+now)?\b/i.test(html));
              if (hasStrongEmployerEvidence) verifiedEmployerHosts = [new URL(root).hostname.replace(/^www\./, '')];
            } catch { /* quarantine below */ }
          }
          const proposal = proposeDiscoverySource({ url: root, title: hit.title, snippet: hit.snippet, html, verifiedEmployerHosts });
          if (proposal.kind === 'source') {
            learned += 1;
            if (!dryRun) {
              await service.from('discovery_sources').upsert({
                company: proposal.source.company,
                display_name: proposal.source.displayName,
                canonical_url: proposal.source.canonicalUrl,
                employer_host: proposal.source.employerHost,
                source_class: proposal.source.sourceClass,
                provider: proposal.source.provider,
                adapter: proposal.source.adapter,
                detector_confidence: proposal.source.detectorConfidence,
                fingerprint_evidence: proposal.source.fingerprintEvidence,
                market_codes: markets,
                trust_level: proposal.source.trustLevel,
                discovered_via: `web_search:${provider}`,
                next_crawl_at: new Date().toISOString(),
              }, { onConflict: 'canonical_url', ignoreDuplicates: true });
            }
          } else {
            quarantined += 1;
            await service.from('discovery_quarantine').insert({ source_url: proposal.url, reason: proposal.reason, provider: proposal.provider, source_class: proposal.sourceClass, candidate: { title: hit.title, snippet: hit.snippet.slice(0, 2000), discovered_by: provider } });
          }
        }
        if (providerHits >= 30) break;
      }
      attempts.push({ provider, status: 'used', results: providerHits });
      if (learned >= 10) break;
    } catch (error) {
      attempts.push({ provider, status: 'failed', error: error instanceof Error ? error.message.slice(0, 300) : 'provider failed' });
    }
  }
  return { learned, quarantined, attempts };
}

async function authorize(request: Request, service: ReturnType<typeof createClient>, url: string, anonKey: string, action: DiscoveryAction) {
  if (action === 'scheduled' || action === 'maintenance' || (action === 'diagnostic' && request.headers.has('x-cron-secret'))) {
    const { data: expected, error } = await service.rpc('read_job_discovery_cron_secret_for_service');
    return !error && Boolean(expected) && request.headers.get('x-cron-secret') === expected;
  }
  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const [{ data: userData }, { data: isAdmin, error: adminError }] = await Promise.all([userClient.auth.getUser(token), userClient.rpc('is_current_admin')]);
  return Boolean(userData.user) && !adminError && isAdmin === true;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) return json(request, { error: 'Service configuration is incomplete' }, 500);
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });

  let rawBody: { action?: string };
  try { rawBody = await request.json(); } catch { return json(request, { error: 'Invalid JSON body' }, 400); }
  const action: DiscoveryAction = ['scheduled', 'manual', 'dry-run', 'maintenance', 'diagnostic'].includes(rawBody.action ?? '') ? rawBody.action as DiscoveryAction : 'manual';
  if (!(await authorize(request, service, url, anonKey, action))) return json(request, { error: 'Unauthorized' }, 401);

  const { data: settingsData, error: settingsError } = await service.from('app_settings')
    .select('discovery_enabled, discovery_time, discovery_timezone, discovery_markets, discovery_web_search_enabled, discovery_web_search_configured, discovery_search_queries, discovery_target_role_keywords, discovery_excluded_title_keywords, discovery_max_required_years, discovery_provider_order, discovery_provider_status, last_scheduled_discovery_date')
    .eq('id', 1).single();
  if (settingsError) return json(request, { error: settingsError.message }, 500);
  const settings = settingsData as Settings;
  if (!settings.discovery_enabled && action === 'scheduled') return json(request, { skipped: true, reason: 'Discovery is paused' });

  const plan = planDiscoveryRun(action);
  const { data: runRow, error: runError } = await service.from('discovery_runs').insert({ action, status: 'running', metrics: { dryRun: plan.dryRun } }).select('id').single();
  if (runError) return json(request, { error: runError.message }, 500);
  const runId = runRow.id;

  let providerKeys: ProviderKeys = {};
  if (settings.discovery_web_search_enabled && settings.discovery_web_search_configured) {
    const { data } = await service.rpc('read_search_provider_keys_for_service');
    if (data && typeof data === 'object') providerKeys = data as ProviderKeys;
  }

  let sourceDiscoveryDue = action === 'manual' || action === 'dry-run';
  let localDate: string | null = null;
  if (action === 'scheduled') {
    try {
      const clock = localClock(settings.discovery_timezone || 'Asia/Singapore');
      localDate = clock.date;
      const [hour, minute] = (settings.discovery_time || '08:00').split(':').map(Number);
      sourceDiscoveryDue = clock.minutes >= hour * 60 + minute && settings.last_scheduled_discovery_date !== clock.date;
    } catch { sourceDiscoveryDue = false; }
  }

  const discovery = (plan.runSourceDiscovery || sourceDiscoveryDue)
    ? await discoverSources(service, settings, providerKeys, plan.dryRun)
    : { learned: 0, quarantined: 0, attempts: [] as unknown[] };

  const { data: leased, error: leaseError } = await service.rpc('lease_discovery_sources', { p_limit: plan.sourceLimit, p_lease_seconds: 120 });
  if (leaseError) {
    await service.from('discovery_runs').update({ status: 'failed', finished_at: new Date().toISOString(), error_summary: leaseError.message }).eq('id', runId);
    return json(request, { error: leaseError.message }, 500);
  }

  const sources = (leased ?? []).map((row: Record<string, unknown>) => mapSource(row));
  const metrics = { sourcesAttempted: sources.length, sourcesSucceeded: 0, sourcesFailed: 0, verifiedOpen: 0, inserted: 0, refreshed: 0, closed: 0, quarantined: discovery.quarantined, sourcesLearned: discovery.learned };
  const markets = settings.discovery_markets?.length ? settings.discovery_markets : ['SG'];

  for (const source of sources) {
    const adapterResult = await fetchSourceJobs(source);
    const now = new Date().toISOString();
    const { data: existingRows } = await service.from('jobs')
      .select('id, source_id, provider_job_id, canonical_url, pipeline, missing_from_source_count, first_seen_at')
      .eq('source_id', source.id);
    const existingJobs = (existingRows ?? []).map((row: Record<string, unknown>) => ({
      id: Number(row.id), sourceId: String(row.source_id), providerJobId: row.provider_job_id ? String(row.provider_job_id) : null,
      canonicalUrl: row.canonical_url ? String(row.canonical_url) : null, pipeline: String(row.pipeline ?? 'Discovered'),
      missingFromSourceCount: Number(row.missing_from_source_count ?? 0), firstSeenAt: row.first_seen_at ? String(row.first_seen_at) : null,
    }));
    const reconciled = reconcileSourceSnapshot({ now, sourceFetchSucceeded: adapterResult.status === 'success', fetchedJobs: adapterResult.jobs, existingJobs });

    if (adapterResult.status === 'success') {
      metrics.sourcesSucceeded += 1;
      metrics.verifiedOpen += adapterResult.jobs.filter((job) => job.availabilityStatus === 'verified_open').length;
      const eligibleInserts = reconciled.inserts.filter((job) => assessEligibility({
        marketCodes: job.countryCodes,
        title: job.title,
        employmentType: job.employmentType,
        requiredYears: requiredExperienceYears(job.descriptionText),
        mandatoryLanguages: mandatoryLanguages(job.descriptionText),
        sponsorshipRestriction: sponsorshipRestriction(job.descriptionText),
      }, { enabledMarkets: markets, maxRequiredYears: settings.discovery_max_required_years ?? 2, verifiedLanguages: ['English', 'Vietnamese'] }).eligible);

      if (!plan.dryRun) {
        for (const item of eligibleInserts) {
          const match = classifyMatch(item);
          const eligibility = assessEligibility({ marketCodes: item.countryCodes, title: item.title, employmentType: item.employmentType, requiredYears: requiredExperienceYears(item.descriptionText), mandatoryLanguages: mandatoryLanguages(item.descriptionText), sponsorshipRestriction: sponsorshipRestriction(item.descriptionText) }, { enabledMarkets: markets, maxRequiredYears: settings.discovery_max_required_years ?? 2, verifiedLanguages: ['English', 'Vietnamese'] });
          const { error } = await service.from('jobs').upsert({
            company: item.company, position: item.title, role_track: match.track, match_score: match.score, match_level: match.level,
            sponsorship: sponsorshipRestriction(item.descriptionText) === 'sponsorship_available' ? 'Available' : 'Unknown',
            location: item.locations.join(' | ') || MARKET_NAME[item.countryCodes[0] ?? source.marketCodes[0] ?? 'SG'],
            work_mode: /\bremote\b/i.test(item.descriptionText) ? 'Remote' : /\bhybrid\b/i.test(item.descriptionText) ? 'Hybrid' : 'Not specified',
            date_found: item.firstSeenAt.slice(0, 10), matched_skills: match.skills,
            gaps_risks: eligibility.risks.join('; ') || 'Verify salary and sponsorship before applying.',
            pipeline: 'Discovered', approved_to_apply: false, employment_type: item.employmentType,
            source: item.sourceClass === 'verified_board' ? 'Verified job board' : 'Official employer source',
            job_url: item.applyUrl || item.canonicalUrl, career_page: source.canonicalUrl, ats_platform: item.provider,
            source_external_id: item.providerJobId, dedupe_key: item.canonicalUrl, job_description: item.descriptionText,
            source_id: item.sourceId, provider_job_id: item.providerJobId, canonical_url: item.canonicalUrl, posted_at: item.postedAt,
            first_seen_at: item.firstSeenAt, last_seen_at: item.lastSeenAt, last_verified_at: item.lastVerifiedAt,
            availability_status: item.availabilityStatus, availability_evidence: item.availabilityEvidence,
            source_trust: source.trustLevel, source_class: item.sourceClass, market_code: item.countryCodes[0] ?? null,
            missing_from_source_count: 0,
          }, { onConflict: item.providerJobId ? 'source_id,provider_job_id' : 'canonical_url', ignoreDuplicates: true });
          if (!error) metrics.inserted += 1;
        }

        for (const refresh of reconciled.refreshes) {
          const { error } = await service.from('jobs').update({ last_seen_at: refresh.lastSeenAt, last_verified_at: refresh.lastVerifiedAt, availability_status: refresh.availabilityStatus, availability_evidence: refresh.availabilityEvidence, posted_at: refresh.postedAt, missing_from_source_count: 0 }).eq('id', refresh.id);
          if (!error) metrics.refreshed += 1;
        }
        for (const missing of reconciled.missingUpdates) await service.from('jobs').update({ missing_from_source_count: missing.missingFromSourceCount }).eq('id', missing.id);
        for (const closed of reconciled.closes) {
          await service.from('jobs').update({ availability_status: closed.availabilityStatus, availability_evidence: closed.availabilityEvidence, approved_to_apply: false }).eq('id', closed.id).eq('pipeline', 'Discovered');
          metrics.closed += 1;
        }
        await service.from('discovery_sources').update({ last_success_at: now, consecutive_failures: 0, last_error_summary: null, lease_expires_at: null, next_crawl_at: new Date(Date.now() + 120 * 60_000).toISOString(), updated_at: now }).eq('id', source.id);
      }
    } else {
      metrics.sourcesFailed += 1;
      if (!plan.dryRun) await service.from('discovery_sources').update({ consecutive_failures: Number((leased ?? []).find((row: Record<string, unknown>) => String(row.id) === source.id)?.consecutive_failures ?? 0) + 1, last_error_summary: adapterResult.error ?? 'Source failed', lease_expires_at: null, next_crawl_at: new Date(Date.now() + 30 * 60_000).toISOString(), updated_at: now }).eq('id', source.id);
    }
  }

  if (!plan.dryRun && sourceDiscoveryDue && localDate) await service.from('app_settings').update({ last_scheduled_discovery_date: localDate, updated_at: new Date().toISOString() }).eq('id', 1);
  const finalStatus = metrics.sourcesFailed && metrics.sourcesSucceeded ? 'partial' : metrics.sourcesFailed && !metrics.sourcesSucceeded ? 'failed' : 'succeeded';
  await service.from('discovery_runs').update({
    status: finalStatus, finished_at: new Date().toISOString(), sources_attempted: metrics.sourcesAttempted, sources_succeeded: metrics.sourcesSucceeded,
    sources_failed: metrics.sourcesFailed, verified_open: metrics.verifiedOpen, inserted: metrics.inserted, refreshed: metrics.refreshed,
    closed: metrics.closed, quarantined: metrics.quarantined, sources_learned: metrics.sourcesLearned,
    metrics: { dryRun: plan.dryRun, providerAttempts: discovery.attempts },
  }).eq('id', runId);

  return json(request, { action, dryRun: plan.dryRun, ...metrics, providerAttempts: discovery.attempts });
});
