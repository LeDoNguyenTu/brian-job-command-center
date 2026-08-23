import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const allowedOrigins = new Set([
  "https://brian-job.vercel.app",
  "http://terminal.local:4173",
  "http://localhost:4173",
]);

const isAllowedOrigin = (origin: string) =>
  allowedOrigins.has(origin) ||
  /^https:\/\/brian-job-command-center(?:-[a-z0-9]+)*\.vercel\.app$/i.test(origin);

const corsHeaders = (request: Request) => ({
  "Access-Control-Allow-Origin": isAllowedOrigin(request.headers.get("origin") || "")
    ? request.headers.get("origin")!
    : "https://brian-job.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
});

type DiscoverySettings = {
  discovery_enabled: boolean;
  discovery_time: string;
  discovery_timezone: string;
  discovery_source_urls: string[];
  discovery_web_search_enabled: boolean;
  discovery_web_search_configured: boolean;
  discovery_search_queries: string[];
  discovery_target_role_keywords: string[];
  discovery_excluded_title_keywords: string[];
  discovery_max_required_years: number;
  discovery_location: string;
  discovery_country: string;
  discovery_web_search_provider: "automatic" | SearchProvider;
  discovery_provider_order: SearchProvider[];
  discovery_monthly_credit_cap: number;
  discovery_source_learning_enabled: boolean;
  discovery_learned_sources: LearnedSource[];
  discovery_provider_status?: ProviderAttempt[];
  last_scheduled_discovery_date: string | null;
};

type LearnedSource = {
  host: string;
  company: string;
  atsPlatform: string;
  bestScore: number;
  matches: number;
  lastSeen: string;
  feedUrl: string | null;
  promoted: boolean;
  jobUrls?: string[];
};

type Candidate = {
  company: string;
  position: string;
  location: string;
  employmentType: string | null;
  jobUrl: string;
  careerPage: string;
  source: string;
  atsPlatform: string;
  externalId: string;
  description: string;
  postedAt: string | null;
  validThrough: string | null;
  availability: "verified_open" | "closed" | "unknown";
  availabilityReason: string;
};

type GreenhouseJob = {
  id?: string | number;
  title?: string;
  absolute_url?: string;
  content?: string;
  location?: { name?: string };
  updated_at?: string;
};

type LeverJob = {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  additionalPlain?: string;
  categories?: { location?: string; commitment?: string };
  createdAt?: number;
};

type SearchProvider = "tavily" | "exa" | "firecrawl" | "brave" | "serpapi" | "serper";

type WebResult = {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string | null;
  score?: number;
};

type TavilySearchPayload = {
  results?: WebResult[];
};

type TavilyExtractPayload = {
  results?: Array<{ url?: string; raw_content?: string }>;
};

type TavilyUsagePayload = {
  key?: { usage?: number; limit?: number };
  account?: { plan_usage?: number; plan_limit?: number; paygo_usage?: number };
};

type BraveSearchPayload = {
  web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
};

type SerperSearchPayload = {
  organic?: Array<{ title?: string; link?: string; snippet?: string }>;
};

type ExaSearchPayload = {
  results?: Array<{ title?: string; url?: string; text?: string; highlights?: string[] }>;
};

type FirecrawlSearchPayload = {
  success?: boolean;
  data?: { web?: Array<{ title?: string; url?: string; description?: string; markdown?: string }> };
};

type SerpApiSearchPayload = {
  organic_results?: Array<{ title?: string; link?: string; snippet?: string }>;
  error?: string;
};

type ProviderKeys = Partial<Record<SearchProvider, string>>;

type ProviderAttempt = {
  provider: SearchProvider;
  status: "used" | "skipped" | "failed";
  reason: string;
  results: number;
  httpStatus?: number | null;
  checkedAt?: string | null;
  zeroCreditCheck?: boolean;
};

const DEFAULT_PROVIDER_ORDER: SearchProvider[] = ["tavily", "exa", "firecrawl", "brave", "serpapi", "serper"];
const MAX_POSTING_AGE_DAYS = 45;
const DAY_MS = 86_400_000;

const json = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });

const stripHtml = (value = "") => value
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;|&#34;/gi, '"')
  .replace(/\s+/g, " ")
  .trim();

const canonicalUrl = (value: string) => value.trim().split("#")[0].split("?")[0].replace(/\/+$/, "").toLowerCase();

const companyFromSlug = (slug: string) => slug
  .replace(/[-_]+/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

function parseSource(source: string) {
  try {
    const url = new URL(source.trim());
    const slug = url.pathname.split("/").filter(Boolean)[0];
    if (!slug) return null;
    if (["boards.greenhouse.io", "job-boards.greenhouse.io", "boards.eu.greenhouse.io"].includes(url.hostname)) {
      return { platform: "Greenhouse", slug, sourceUrl: url.toString() } as const;
    }
    if (url.hostname === "jobs.lever.co") {
      return { platform: "Lever", slug, sourceUrl: url.toString() } as const;
    }
  } catch {
    return null;
  }
  return null;
}

function repeatableFeed(jobUrl: string) {
  try {
    const url = new URL(jobUrl);
    const slug = url.pathname.split("/").filter(Boolean)[0];
    if (!slug) return null;
    if (["boards.greenhouse.io", "job-boards.greenhouse.io", "boards.eu.greenhouse.io"].includes(url.hostname)) {
      return `https://${url.hostname}/${slug}`;
    }
    if (url.hostname === "jobs.lever.co") return `https://jobs.lever.co/${slug}`;
  } catch { /* keep as non-repeatable */ }
  return null;
}

async function fetchGreenhouse(slug: string, sourceUrl: string): Promise<Candidate[]> {
  const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`, {
    headers: { "User-Agent": "Brian-Job-Command-Center/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Greenhouse source ${slug} returned ${response.status}`);
  const payload = await response.json();
  return (payload.jobs ?? []).map((job: GreenhouseJob) => ({
    company: companyFromSlug(slug),
    position: String(job.title ?? "Untitled role"),
    location: String(job.location?.name ?? "Not specified"),
    employmentType: null,
    jobUrl: String(job.absolute_url ?? ""),
    careerPage: sourceUrl,
    source: "Company career page",
    atsPlatform: "Greenhouse",
    externalId: String(job.id ?? ""),
    description: stripHtml(String(job.content ?? "")),
    postedAt: parseDateValue(job.updated_at),
    validThrough: null,
    availability: "verified_open",
    availabilityReason: "Present in the live Greenhouse board feed",
  })).filter((job: Candidate) => job.jobUrl);
}

async function fetchLever(slug: string, sourceUrl: string): Promise<Candidate[]> {
  const response = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`, {
    headers: { "User-Agent": "Brian-Job-Command-Center/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Lever source ${slug} returned ${response.status}`);
  const payload = await response.json();
  return (Array.isArray(payload) ? payload : []).map((job: LeverJob) => ({
    company: companyFromSlug(slug),
    position: String(job.text ?? "Untitled role"),
    location: String(job.categories?.location ?? "Not specified"),
    employmentType: job.categories?.commitment ? String(job.categories.commitment) : null,
    jobUrl: String(job.hostedUrl ?? job.applyUrl ?? ""),
    careerPage: sourceUrl,
    source: "Company career page",
    atsPlatform: "Lever",
    externalId: String(job.id ?? ""),
    description: stripHtml(`${job.descriptionPlain ?? ""} ${job.additionalPlain ?? ""}`),
    postedAt: typeof job.createdAt === "number" ? new Date(job.createdAt).toISOString() : null,
    validThrough: null,
    availability: "verified_open",
    availabilityReason: "Present in the live Lever board feed",
  })).filter((job: Candidate) => job.jobUrl);
}

const sourceLabel = (hostname: string) => {
  if (hostname.includes("linkedin.com")) return "LinkedIn";
  if (hostname.includes("indeed.com")) return "Indeed";
  if (hostname.includes("mycareersfuture.gov.sg")) return "MyCareersFuture";
  if (hostname.includes("jobstreet.com")) return "JobStreet";
  if (hostname.includes("myworkdayjobs.com") || hostname.includes("workday.com")) return "Workday";
  if (hostname.includes("smartrecruiters.com")) return "SmartRecruiters";
  if (hostname.includes("ashbyhq.com")) return "Ashby";
  if (hostname.includes("workable.com")) return "Workable";
  if (hostname.includes("successfactors.")) return "SAP SuccessFactors";
  if (hostname.includes("icims.com")) return "iCIMS";
  if (hostname.includes("oraclecloud.com")) return "Oracle Recruiting";
  if (hostname.includes("bamboohr.com")) return "BambooHR";
  return hostname.replace(/^www\./, "");
};

const isIndividualJobResult = (url: URL, title: string) => {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  if (host.includes("linkedin.com")) return path.includes("/jobs/view/");
  if (host.includes("indeed.com")) return path.includes("/viewjob") || url.searchParams.has("jk");
  if (host.includes("mycareersfuture.gov.sg")) return path.includes("/job/");
  if (host.includes("jobstreet.com")) return /\/job\/\d+/.test(path);
  if (host.includes("myworkdayjobs.com")) return /\/job\//.test(path);
  if (host.includes("smartrecruiters.com")) return /\/jobs\/\d+/.test(path);
  if (host.includes("ashbyhq.com")) return path.split("/").filter(Boolean).length >= 2;
  if (host.includes("workable.com")) return /\/j\//.test(path) || path.split("/").filter(Boolean).length >= 2;
  if (host.includes("icims.com")) return /\/jobs\/\d+/.test(path);
  if (host.includes("oraclecloud.com")) return /\/job\/\d+/.test(path) || /jobapplications/.test(path);
  if (host.includes("bamboohr.com")) return /\/careers\/\d+/.test(path);
  if (/\b(job search|jobs in|job vacancies|career opportunities|search results)\b/i.test(title)) return false;
  return !/(^|\/)jobs?\/?$|(^|\/)careers?\/?$|\/jobs\/search|\/search\/?$/.test(path)
    && /job|career|position|vacan|opening|recruit|apply/.test(`${path} ${title}`.toLowerCase());
};

function webResultIdentity(result: WebResult, location: string) {
  const rawTitle = stripHtml(String(result.title ?? "Untitled role"));
  try {
    const jobUrl = new URL(String(result.url ?? ""));
    if (jobUrl.hostname.toLowerCase().includes("linkedin.com") && jobUrl.pathname.includes("/jobs/view/")) {
      const slug = decodeURIComponent(jobUrl.pathname.split("/jobs/view/")[1] ?? "").replace(/-\d+\/?$/, "");
      const companyMarker = slug.lastIndexOf("-at-");
      if (companyMarker > 0) {
        const position = companyFromSlug(slug.slice(0, companyMarker)).replace(/\s+[–—]\s+.*$/, "").trim();
        const company = companyFromSlug(slug.slice(companyMarker + 4)).trim();
        if (position && company) return { position, company };
      }
    }
  } catch { /* use the result title fallback */ }
  const linkedIn = rawTitle.match(new RegExp(`^(.+?)\\s+hiring\\s+(.+?)\\s+in\\s+${location.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "i"));
  if (linkedIn) return { company: linkedIn[1].trim(), position: linkedIn[2].trim() };

  const cleanTitle = rawTitle
    .replace(/\s*[|·]\s*(LinkedIn|Indeed|JobStreet|MyCareersFuture|Careers|Jobs).*$/i, "")
    .trim();
  const parts = cleanTitle.split(/\s+(?:at|@|[-–—])\s+/i).filter(Boolean);
  if (parts.length > 1) return { position: parts[0].trim(), company: parts.at(-1)!.trim() };
  let company = "Web opportunity";
  try { company = companyFromSlug(new URL(String(result.url ?? "")).hostname.replace(/^www\./, "").split(".")[0]); } catch { /* keep fallback */ }
  return { position: cleanTitle, company };
}

function explicitTitleLocation(value: string) {
  const title = stripHtml(value);
  const match = title.match(/\b(?:job|vacancy|position)\s+in\s+([^|·]+?)(?:\s*[|·]|$)/i)
    || title.match(/\blocation\s*[:|-]\s*([^|·]+?)(?:\s*[|·]|$)/i);
  return match?.[1]?.trim().replace(/\s+(?:job|jobs|careers?)$/i, "") || null;
}

async function fetchTavilyUsage(apiKey: string) {
  const response = await fetch("https://api.tavily.com/usage", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Tavily usage check returned ${response.status}`);
  const payload = await response.json() as TavilyUsagePayload;
  const keyUsage = Number(payload.key?.usage ?? 0);
  const accountUsage = Number(payload.account?.plan_usage ?? 0);
  const keyLimit = Number(payload.key?.limit ?? 0);
  const accountLimit = Number(payload.account?.plan_limit ?? 0);
  return {
    // The monthly safety ceiling belongs to the account. A project-scoped key may
    // report zero even when the account has already consumed credits.
    usage: Math.max(keyUsage, accountUsage),
    limit: accountLimit || keyLimit || 1000,
    paygoUsage: Number(payload.account?.paygo_usage ?? 0),
    httpStatus: response.status,
  };
}

async function checkProviderWithoutSearch(provider: SearchProvider, apiKey: string) {
  const checkedAt = new Date().toISOString();
  if (provider === "tavily") {
    const response = await fetch("https://api.tavily.com/usage", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const usage = response.ok ? await response.json() as TavilyUsagePayload : null;
    const keyUsage = Number(usage?.key?.usage ?? 0);
    const accountUsage = Number(usage?.account?.plan_usage ?? 0);
    const keyLimit = Number(usage?.key?.limit ?? 0);
    const accountLimit = Number(usage?.account?.plan_limit ?? 0);
    return {
      httpStatus: response.status,
      checkedAt,
      reason: response.ok ? "Key accepted by Tavily's free usage endpoint" : `Tavily usage endpoint returned HTTP ${response.status}`,
      tavilyUsage: response.ok ? {
        usage: Math.max(keyUsage, accountUsage),
        limit: accountLimit || keyLimit || 1000,
        paygoUsage: Number(usage?.account?.paygo_usage ?? 0),
      } : null,
    };
  }
  if (provider === "firecrawl") {
    const response = await fetch("https://api.firecrawl.dev/v2/team/credit-usage", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return {
      httpStatus: response.status,
      checkedAt,
      reason: response.ok ? "Key accepted by Firecrawl's free credit-usage endpoint" : `Firecrawl account endpoint returned HTTP ${response.status}`,
      tavilyUsage: null,
    };
  }
  if (provider === "serpapi") {
    const response = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(apiKey)}`);
    return {
      httpStatus: response.status,
      checkedAt,
      reason: response.ok ? "Key accepted by SerpApi's free Account API" : `SerpApi Account API returned HTTP ${response.status}`,
      tavilyUsage: null,
    };
  }
  return null;
}

const filterJobResults = (results: WebResult[]) => results.filter((result) => {
  try {
    const jobUrl = new URL(String(result.url ?? ""));
    return jobUrl.protocol === "https:" && isIndividualJobResult(jobUrl, String(result.title ?? ""));
  } catch {
    return false;
  }
});

function interleaveUniqueResults(resultSets: WebResult[][], limit = 48) {
  const rows: WebResult[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...resultSets.map((results) => results.length));
  for (let index = 0; index < longest && rows.length < limit; index += 1) {
    for (const results of resultSets) {
      const result = results[index];
      if (!result?.url) continue;
      const key = canonicalUrl(String(result.url));
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push(result);
      if (rows.length >= limit) break;
    }
  }
  return rows;
}

const fullJobQuery = (query: string, location: string) =>
  `${query} in ${location} jobs graduate junior entry level associate -senior -staff -principal -lead -manager -director`;

const countryCode = (country: string) => ({
  singapore: "sg",
  malaysia: "my",
  vietnam: "vn",
  thailand: "th",
  indonesia: "id",
  philippines: "ph",
  australia: "au",
}[country.toLowerCase()] ?? country.toLowerCase().slice(0, 2));

const braveCountryCode = (country: string) => {
  const code = countryCode(country).toUpperCase();
  const supported = new Set([
    "AR", "AU", "AT", "BE", "BR", "CA", "CL", "DK", "FI", "FR", "DE", "HK", "IN", "ID",
    "IT", "JP", "KR", "MY", "MX", "NL", "NZ", "NO", "CN", "PL", "PT", "PH", "RU", "SA",
    "ZA", "ES", "SE", "CH", "TW", "TR", "GB", "US",
  ]);
  return supported.has(code) ? code : "ALL";
};

async function fetchTavilySearch(query: string, apiKey: string, location: string, country: string): Promise<WebResult[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: fullJobQuery(query, location),
      topic: "general",
      search_depth: "basic",
      max_results: 12,
      include_answer: false,
      include_images: false,
      include_raw_content: false,
      time_range: "week",
      country: country.toLowerCase(),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Tavily search returned ${response.status}`);
  const payload = await response.json() as TavilySearchPayload;
  return filterJobResults(payload.results ?? []);
}

async function fetchBraveSearch(query: string, apiKey: string, location: string, country: string): Promise<WebResult[]> {
  const params = new URLSearchParams({
    q: fullJobQuery(query, location),
    count: "20",
    country: braveCountryCode(country),
    search_lang: "en",
    freshness: "pw",
    safesearch: "moderate",
  });
  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Brave Search returned ${response.status}`);
  const payload = await response.json() as BraveSearchPayload;
  return filterJobResults((payload.web?.results ?? []).map((result) => ({
    title: result.title,
    url: result.url,
    content: result.description,
  })));
}

async function fetchSerperSearch(query: string, apiKey: string, location: string, country: string): Promise<WebResult[]> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      q: fullJobQuery(query, location),
      gl: countryCode(country),
      hl: "en",
      num: 20,
      tbs: "qdr:w",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Serper search returned ${response.status}`);
  const payload = await response.json() as SerperSearchPayload;
  return filterJobResults((payload.organic ?? []).map((result) => ({
    title: result.title,
    url: result.link,
    content: result.snippet,
  })));
}

async function fetchExaSearch(query: string, apiKey: string, location: string): Promise<WebResult[]> {
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: fullJobQuery(query, location),
      type: "auto",
      numResults: 20,
      startPublishedDate: new Date(Date.now() - 8 * 86_400_000).toISOString(),
      contents: { text: { maxCharacters: 20_000 } },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Exa search returned ${response.status}`);
  const payload = await response.json() as ExaSearchPayload;
  return filterJobResults((payload.results ?? []).map((result) => ({
    title: result.title,
    url: result.url,
    content: result.highlights?.join(" "),
    raw_content: result.text,
  })));
}

async function fetchFirecrawlSearch(query: string, apiKey: string, location: string): Promise<WebResult[]> {
  const response = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: fullJobQuery(query, location),
      limit: 20,
      sources: ["web"],
      tbs: "qdr:w",
      scrapeOptions: { formats: [{ type: "markdown" }], onlyMainContent: true },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Firecrawl search returned ${response.status}`);
  const payload = await response.json() as FirecrawlSearchPayload;
  return filterJobResults((payload.data?.web ?? []).map((result) => ({
    title: result.title,
    url: result.url,
    content: result.description,
    raw_content: result.markdown,
  })));
}

async function fetchSerpApiSearch(query: string, apiKey: string, location: string, country: string): Promise<WebResult[]> {
  const params = new URLSearchParams({
    engine: "google",
    q: fullJobQuery(query, location),
    api_key: apiKey,
    gl: countryCode(country),
    hl: "en",
    num: "20",
    tbs: "qdr:w",
  });
  const response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`SerpApi search returned ${response.status}`);
  const payload = await response.json() as SerpApiSearchPayload;
  if (payload.error) throw new Error(`SerpApi: ${payload.error}`);
  return filterJobResults((payload.organic_results ?? []).map((result) => ({
    title: result.title,
    url: result.link,
    content: result.snippet,
  })));
}

async function searchProvider(provider: SearchProvider, query: string, apiKey: string, location: string, country: string) {
  if (provider === "tavily") return fetchTavilySearch(query, apiKey, location, country);
  if (provider === "exa") return fetchExaSearch(query, apiKey, location);
  if (provider === "firecrawl") return fetchFirecrawlSearch(query, apiKey, location);
  if (provider === "brave") return fetchBraveSearch(query, apiKey, location, country);
  if (provider === "serpapi") return fetchSerpApiSearch(query, apiKey, location, country);
  return fetchSerperSearch(query, apiKey, location, country);
}

async function directPageText(url: string) {
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Brian-Job-Command-Center/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return "";
    return stripHtml((await response.text()).slice(0, 1_000_000)).slice(0, 80_000);
  } catch {
    return "";
  }
}

function parseDateValue(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const year = new Date(timestamp).getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return new Date(timestamp).toISOString();
}

function inferRelativePostedAt(value: string) {
  const match = value.match(/\b(\d{1,3})\s+(minutes?|hours?|days?|weeks?|months?)\s+ago\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const days = unit.startsWith("minute") || unit.startsWith("hour")
    ? 0
    : unit.startsWith("day")
      ? amount
      : unit.startsWith("week")
        ? amount * 7
        : amount * 30;
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function jobPostingMetadata(html: string) {
  const records: Array<Record<string, unknown>> = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const type = record["@type"];
    if ((typeof type === "string" && type.toLowerCase() === "jobposting")
      || (Array.isArray(type) && type.some((item) => String(item).toLowerCase() === "jobposting"))) records.push(record);
    Object.values(record).forEach(visit);
  };
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1].trim())); } catch { /* Ignore malformed third-party metadata. */ }
  }
  const posting = records[0];
  const timeDate = html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1];
  const metaDate = html.match(/<(?:meta|span)[^>]+(?:itemprop=["']datePosted["']|property=["']article:published_time["'])[^>]+(?:content|datetime)=["']([^"']+)["']/i)?.[1];
  return {
    postedAt: parseDateValue(posting?.datePosted) || parseDateValue(metaDate) || parseDateValue(timeDate),
    validThrough: parseDateValue(posting?.validThrough),
    hasJobPosting: records.length > 0,
  };
}

function closedListingReason(value: string) {
  const checks: Array<[RegExp, string]> = [
    [/\b(?:this|the) (?:job|position|vacancy|posting) (?:is|has been) (?:closed|filled|removed|expired|no longer available)\b/i, "Employer says the listing is closed"],
    [/\b(?:job|position|vacancy|posting) (?:is )?no longer available\b/i, "Employer says the listing is no longer available"],
    [/\bno longer accepting applications\b/i, "Employer is no longer accepting applications"],
    [/\bapplications? (?:are|is|have) closed\b/i, "Applications are closed"],
    [/\bapplications? (?:are|is) no longer being accepted\b/i, "Applications are no longer being accepted"],
    [/\b(?:job|position|vacancy) (?:was )?not found\b/i, "The vacancy page no longer exists"],
  ];
  return checks.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}

async function inspectWebCandidate(candidate: Candidate): Promise<Candidate> {
  const snippetClosedReason = closedListingReason(candidate.description);
  if (snippetClosedReason) return { ...candidate, availability: "closed", availabilityReason: snippetClosedReason };
  try {
    const response = await fetch(candidate.jobUrl, {
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Brian-Job-Command-Center/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(7_000),
    });
    if (response.status === 404 || response.status === 410) {
      return { ...candidate, availability: "closed", availabilityReason: `Employer page returned HTTP ${response.status}` };
    }
    if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) {
      return {
        ...candidate,
        postedAt: candidate.postedAt || inferRelativePostedAt(candidate.description),
        availability: "unknown",
        availabilityReason: `Employer page could not be verified directly (HTTP ${response.status})`,
      };
    }
    const html = (await response.text()).slice(0, 1_500_000);
    const text = stripHtml(html).slice(0, 100_000);
    const metadata = jobPostingMetadata(html);
    const postedAt = metadata.postedAt || candidate.postedAt || inferRelativePostedAt(candidate.description);
    if (metadata.validThrough && Date.parse(metadata.validThrough) < Date.now()) {
      return { ...candidate, postedAt, validThrough: metadata.validThrough, availability: "closed", availabilityReason: "The employer's valid-through date has passed" };
    }
    const pageClosedReason = closedListingReason(text);
    if (pageClosedReason) {
      return { ...candidate, postedAt, validThrough: metadata.validThrough, availability: "closed", availabilityReason: pageClosedReason };
    }
    const hasApplyAction = /\b(?:apply now|apply for this job|submit (?:an )?application|start (?:your )?application)\b/i.test(text);
    return {
      ...candidate,
      description: candidate.description.length >= 300 ? candidate.description : text || candidate.description,
      postedAt,
      validThrough: metadata.validThrough,
      availability: metadata.hasJobPosting || hasApplyAction ? "verified_open" : "unknown",
      availabilityReason: metadata.hasJobPosting
        ? "Current JobPosting metadata is present on the employer page"
        : hasApplyAction
          ? "The employer page currently offers an application action"
          : "The employer page loaded but did not expose a reliable open or closed signal",
    };
  } catch {
    return {
      ...candidate,
      postedAt: candidate.postedAt || inferRelativePostedAt(candidate.description),
      availability: "unknown",
      availabilityReason: "The employer page could not be verified during this scan",
    };
  }
}

async function inspectWebCandidates(candidates: Candidate[]) {
  const checked: Candidate[] = [];
  for (let index = 0; index < candidates.length; index += 8) {
    checked.push(...await Promise.all(candidates.slice(index, index + 8).map(inspectWebCandidate)));
  }
  return checked;
}

async function extractWebResults(results: WebResult[], tavilyKey: string | null, location: string, provider: SearchProvider): Promise<Candidate[]> {
  const extracted = new Map<string, string>();
  const uniqueResults = [...new Map(results.map((result) => [canonicalUrl(String(result.url ?? "")), result])).values()].slice(0, 48);
  const batches = Array.from({ length: Math.ceil(uniqueResults.length / 20) }, (_, index) => uniqueResults.slice(index * 20, index * 20 + 20));
  if (tavilyKey) {
    await Promise.all(batches.map(async (batch) => {
      const response = await fetch("https://api.tavily.com/extract", {
        method: "POST",
        headers: { Authorization: `Bearer ${tavilyKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ urls: batch.map((result) => result.url), extract_depth: "basic", format: "markdown", include_images: false }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return;
      const payload = await response.json() as TavilyExtractPayload;
      for (const result of payload.results ?? []) {
        if (result.url) extracted.set(canonicalUrl(result.url), stripHtml(String(result.raw_content ?? "")));
      }
    }));
  } else if (provider !== "exa" && provider !== "firecrawl") {
    const missingContent = uniqueResults.filter((result) => stripHtml(String(result.raw_content ?? "")).length < 300).slice(0, 32);
    const pageBatches = Array.from({ length: Math.ceil(missingContent.length / 8) }, (_, index) => missingContent.slice(index * 8, index * 8 + 8));
    await Promise.all(pageBatches.map(async (batch) => {
      const descriptions = await Promise.all(batch.map((result) => directPageText(String(result.url ?? ""))));
      descriptions.forEach((description, batchIndex) => {
        if (description) extracted.set(canonicalUrl(String(batch[batchIndex].url ?? "")), description);
      });
    }));
  }

  return uniqueResults.flatMap((result) => {
    try {
      const jobUrl = new URL(String(result.url ?? ""));
      const identity = webResultIdentity(result, location);
      const description = stripHtml(String(result.raw_content ?? ""))
        || extracted.get(canonicalUrl(jobUrl.toString()))
        || stripHtml(String(result.content ?? ""));
      const locationPattern = new RegExp(`\\b${location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i");
      const hasLocationEvidence = locationPattern.test(`${result.title ?? ""} ${result.content ?? ""} ${description}`);
      const titleLocation = explicitTitleLocation(String(result.title ?? ""));
      const candidateLocation = titleLocation && !locationPattern.test(titleLocation)
        ? titleLocation
        : hasLocationEvidence
          ? location
          : "Not specified";
      return [{
        company: identity.company,
        position: identity.position,
        location: candidateLocation,
        employmentType: /\bpart[- ]?time\b/i.test(description) ? "Part-time" : /\bcontract\b/i.test(description) ? "Contract" : /\bintern(?:ship)?\b/i.test(description) ? "Internship" : null,
        jobUrl: jobUrl.toString(),
        careerPage: `${jobUrl.protocol}//${jobUrl.hostname}`,
        source: `${({ tavily: "Tavily", exa: "Exa", firecrawl: "Firecrawl", brave: "Brave Search", serpapi: "SerpApi", serper: "Serper" } as Record<SearchProvider, string>)[provider]} web discovery`,
        atsPlatform: sourceLabel(jobUrl.hostname),
        externalId: canonicalUrl(jobUrl.toString()),
        description,
        postedAt: inferRelativePostedAt(`${result.content ?? ""} ${description.slice(0, 500)}`),
        validThrough: null,
        availability: "unknown",
        availabilityReason: "Awaiting live employer-page verification",
      }];
    } catch {
      return [];
    }
  });
}

function buildWebQueries(configuredQueries: string[], location: string) {
  const countries = /\b(?:singapore|malaysia|vietnam|viet nam|thailand|indonesia|philippines|australia)\b/gi;
  const configured = configuredQueries.map((query) => query.replace(countries, " ").replace(/\s+/g, " ").trim());
  const coverageQueries = [
    `early career technology jobs ${location} Workday Ashby SmartRecruiters Workable iCIMS Oracle`,
    `company careers graduate technology roles ${location} software cybersecurity cloud IT support`,
  ];
  return [...new Map([...configured, ...coverageQueries].filter(Boolean).map((query) => [query.toLowerCase(), query])).values()].slice(0, 10);
}

function localClock(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    minutes: Number(value.hour) * 60 + Number(value.minute),
  };
}

function requiredExperienceYears(value: string) {
  let required = 0;
  for (const sentence of value.split(/[.!?\n]+/)) {
    if (/preferred|nice to have|advantage|bonus|plus but not required|up to\s+\d+/i.test(sentence)) continue;
    const patterns = [
      /\b(?:minimum(?: of)?|at least|requires?|required)\s*(\d+)\s*\+?\s*(?:years?|yrs?)\b/gi,
      /\b(\d+)\s*\+\s*(?:years?|yrs?|yoe)\b/gi,
      /\b(\d+)\s*(?:years?|yrs?|yoe)\s+(?:of\s+)?(?:professional|commercial|industry|relevant|work|hands-on)\s+experience\b/gi,
    ];
    for (const pattern of patterns) {
      for (const match of sentence.matchAll(pattern)) required = Math.max(required, Number(match[1]) || 0);
    }
    for (const match of sentence.matchAll(/\b(\d+)\s*(?:-|to)\s*(\d+)\s*(?:years?|yrs?)\b/gi)) {
      required = Math.max(required, Number(match[1]) || 0);
    }
  }
  return required;
}

const countryLocationAliases: Record<string, string[]> = {
  singapore: ["singapore"],
  malaysia: ["malaysia", "kuala lumpur", "selangor", "penang", "johor"],
  vietnam: ["vietnam", "viet nam", "ho chi minh", "hanoi", "ha noi", "da nang"],
  thailand: ["thailand", "bangkok"],
  indonesia: ["indonesia", "jakarta"],
  philippines: ["philippines", "manila", "makati", "taguig"],
  australia: ["australia", "sydney", "melbourne", "brisbane", "perth"],
};

function isTargetLocation(candidate: Candidate, targetLocation: string, targetCountry: string) {
  if (/\bremote\b/i.test(targetLocation)) return /\bremote\b/i.test(candidate.location);
  const locationText = candidate.location.toLowerCase();
  const terms = [targetLocation.toLowerCase(), ...(countryLocationAliases[targetCountry.toLowerCase()] ?? [targetCountry.toLowerCase()])]
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
  return terms.some((term) => locationText.includes(term));
}

function containsConfiguredKeyword(value: string, keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.length <= 3) {
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(value);
  }
  return value.includes(normalized);
}

function assessEligibility(
  candidate: Candidate,
  maxRequiredYears: number,
  targetLocation: string,
  targetCountry: string,
  targetRoleKeywords: string[],
  excludedTitleKeywords: string[],
) {
  const title = candidate.position.toLowerCase();
  const text = `${candidate.position} ${candidate.location} ${candidate.description}`.toLowerCase();
  const seniorTitle = excludedTitleKeywords.some((keyword) => containsConfiguredKeyword(title, keyword));
  const targetRole = targetRoleKeywords.some((keyword) => containsConfiguredKeyword(title, keyword));
  const mandatoryMandarin = /mandarin.{0,35}(required|mandatory|must|essential)/.test(text)
    || /(required|mandatory|must|essential).{0,35}mandarin/.test(text)
    || /chinese language.{0,35}(required|mandatory|must)/.test(text);
  const restrictedResidency = /(only|must be|restricted to|open only to).{0,60}(citizen|citizenship|permanent resident|\bpr\b|existing work authori[sz]ation|right to work)/.test(text)
    || /(citizen|citizenship|permanent resident|\bpr\b|existing work authori[sz]ation|right to work).{0,45}(only|required|must)/.test(text)
    || /(?:no|without)\s+(?:visa\s+)?sponsorship|unable to sponsor|will not sponsor/.test(text);
  const targetBased = isTargetLocation(candidate, targetLocation, targetCountry);
  const experienceYears = requiredExperienceYears(text);
  const experiencedLevel = /\bexperience\s*(?:[:|-]\s*)?(?:mid[- ]?level|senior)\b/.test(text);
  const stalePosting = /\b(?:[3-9]|1\d)\s+months?\s+ago\b|\b(?:[1-9]\d*)\s+years?\s+ago\b|\b(?:6\d|[7-9]\d|\d{3,})\s+days?\s+ago\b/.test(text);
  const postingAgeDays = candidate.postedAt ? Math.floor((Date.now() - Date.parse(candidate.postedAt)) / DAY_MS) : null;
  if (candidate.availability === "closed") return { eligible: false, reason: "closed or expired listing", experienceYears };
  if (candidate.validThrough && Date.parse(candidate.validThrough) < Date.now()) return { eligible: false, reason: "closed or expired listing", experienceYears };
  if (postingAgeDays !== null && postingAgeDays > MAX_POSTING_AGE_DAYS) return { eligible: false, reason: `posted more than ${MAX_POSTING_AGE_DAYS} days ago`, experienceYears };
  if (!targetBased) return { eligible: false, reason: `outside ${targetLocation}`, experienceYears };
  if (!targetRole) return { eligible: false, reason: "outside target roles", experienceYears };
  if (seniorTitle) return { eligible: false, reason: "senior title", experienceYears };
  if (experiencedLevel) return { eligible: false, reason: "mid-level or senior experience", experienceYears };
  if (experienceYears > maxRequiredYears) return { eligible: false, reason: `requires ${experienceYears}+ years`, experienceYears };
  if (stalePosting) return { eligible: false, reason: "stale posting", experienceYears };
  if (mandatoryMandarin) return { eligible: false, reason: "mandatory Mandarin", experienceYears };
  if (restrictedResidency) return { eligible: false, reason: "citizenship or PR restriction", experienceYears };
  return { eligible: true, reason: "eligible", experienceYears };
}

function discoveryPriority(candidate: Candidate) {
  return {
    posted: candidate.postedAt ? Date.parse(candidate.postedAt) : 0,
    availability: candidate.availability === "verified_open" ? 2 : candidate.availability === "unknown" ? 1 : 0,
  };
}

function classify(candidate: Candidate) {
  const text = `${candidate.position} ${candidate.description}`.toLowerCase();
  const track = /security|cyber|soc|vulnerab/.test(text)
    ? "Security"
    : /cloud|infrastructure|network|system administrator|devops/.test(text)
      ? "Cloud"
      : /software|developer|engineer|backend|frontend|full.?stack|programmer/.test(text)
        ? "Software"
        : /support|help.?desk|technician|operations/.test(text)
          ? "IT Support"
          : "Other";
  const skills = [
    ["Python", /\bpython\b/], ["JavaScript", /javascript|typescript|node\.?js/],
    ["APIs", /\bapi\b|restful/], ["Cloud", /aws|azure|gcp|cloud/],
    ["Security", /security|cyber|soc|vulnerab/], ["Infrastructure", /infrastructure|network|linux|windows server/],
    ["SQL", /\bsql\b|postgres|mysql/], ["Support", /support|help.?desk|troubleshoot/],
  ].filter(([, pattern]) => (pattern as RegExp).test(text)).map(([skill]) => skill as string).slice(0, 5);
  const earlyCareer = /graduate|junior|entry.?level|associate|trainee|intern/.test(text);
  const experienceYears = requiredExperienceYears(text);
  const score = Math.min(92, 55 + skills.length * 5 + (earlyCareer ? 15 : 0) - (experienceYears === 1 ? 5 : 0));
  return { track, skills, score, level: score >= 80 ? "Strong" : "Review" };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) return json(request, { error: "Service configuration is incomplete" }, 500);

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  let body: { action?: string } = {};
  try { body = await request.json(); } catch { return json(request, { error: "Invalid JSON body" }, 400); }
  const action = body.action === "scheduled"
    ? "scheduled"
    : body.action === "maintenance"
      ? "maintenance"
      : body.action === "diagnostic"
        ? "diagnostic"
        : "manual";

  if (action === "scheduled" || action === "maintenance" || (action === "diagnostic" && request.headers.has("x-cron-secret"))) {
    const { data: expected, error } = await service.rpc("read_job_discovery_cron_secret_for_service");
    if (error || !expected || request.headers.get("x-cron-secret") !== expected) return json(request, { error: "Unauthorized" }, 401);
  } else {
    const authorization = request.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return json(request, { error: "Unauthorized" }, 401);
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const [{ data: userData }, { data: isAdmin, error: adminError }] = await Promise.all([
      userClient.auth.getUser(token),
      userClient.rpc("is_current_admin"),
    ]);
    if (!userData.user || adminError || isAdmin !== true) return json(request, { error: "Unauthorized" }, 401);
  }

  const { data: settingsData, error: settingsError } = await service
    .from("app_settings")
    .select("discovery_enabled, discovery_time, discovery_timezone, discovery_source_urls, discovery_web_search_enabled, discovery_web_search_configured, discovery_search_queries, discovery_target_role_keywords, discovery_excluded_title_keywords, discovery_max_required_years, discovery_location, discovery_country, discovery_web_search_provider, discovery_provider_order, discovery_monthly_credit_cap, discovery_source_learning_enabled, discovery_learned_sources, discovery_provider_status, last_scheduled_discovery_date")
    .eq("id", 1)
    .single();
  if (settingsError) return json(request, { error: settingsError.message }, 500);
  const settings = settingsData as DiscoverySettings;

  if (!settings.discovery_enabled && action === "scheduled") return json(request, { skipped: true, reason: "Discovery is paused" });
  let providerKeys: ProviderKeys = {};
  if (settings.discovery_web_search_enabled && settings.discovery_web_search_configured) {
    const { data, error } = await service.rpc("read_search_provider_keys_for_service");
    if (error) return json(request, { error: error.message }, 500);
    if (data && typeof data === "object") providerKeys = data as ProviderKeys;
  }
  const configuredProviders = (settings.discovery_provider_order?.length ? settings.discovery_provider_order : DEFAULT_PROVIDER_ORDER)
    .filter((provider, index, order) => DEFAULT_PROVIDER_ORDER.includes(provider) && order.indexOf(provider) === index && Boolean(providerKeys[provider]));

  if (action === "diagnostic") {
    const previousStatuses = new Map((settings.discovery_provider_status ?? []).map((item) => [item.provider, item]));
    const diagnostics: ProviderAttempt[] = [];
    let latestTavilyUsage: { usage: number; limit: number; paygoUsage: number } | null = null;
    for (const provider of DEFAULT_PROVIDER_ORDER) {
      const apiKey = providerKeys[provider];
      if (!apiKey) {
        diagnostics.push({ provider, status: "skipped", reason: "No saved key", results: 0, httpStatus: null, checkedAt: new Date().toISOString(), zeroCreditCheck: true });
        continue;
      }
      try {
        const check = await checkProviderWithoutSearch(provider, apiKey);
        if (!check) {
          const previous = previousStatuses.get(provider);
          diagnostics.push({
            provider,
            status: previous?.status ?? "skipped",
            reason: previous?.httpStatus
              ? "No zero-credit validation endpoint. Showing the most recent real scan response."
              : "Provider does not publish a zero-credit key validation endpoint.",
            results: previous?.results ?? 0,
            httpStatus: previous?.httpStatus ?? null,
            checkedAt: previous?.checkedAt ?? null,
            zeroCreditCheck: false,
          });
          continue;
        }
        if (provider === "tavily" && check.tavilyUsage) latestTavilyUsage = check.tavilyUsage;
        diagnostics.push({
          provider,
          status: check.httpStatus >= 200 && check.httpStatus < 300 ? "used" : "failed",
          reason: check.reason,
          results: 0,
          httpStatus: check.httpStatus,
          checkedAt: check.checkedAt,
          zeroCreditCheck: true,
        });
      } catch (error) {
        diagnostics.push({
          provider,
          status: "failed",
          reason: error instanceof Error ? error.message : "Provider account check failed",
          results: 0,
          httpStatus: null,
          checkedAt: new Date().toISOString(),
          zeroCreditCheck: true,
        });
      }
    }
    await service.from("app_settings").update({
      discovery_provider_status: diagnostics,
      ...(latestTavilyUsage ? {
        discovery_last_credit_usage: latestTavilyUsage.usage,
        discovery_last_credit_limit: latestTavilyUsage.limit,
      } : {}),
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    return json(request, {
      diagnostics,
      checked: diagnostics.filter((item) => item.zeroCreditCheck && item.httpStatus !== null).length,
      unavailable: diagnostics.filter((item) => !item.zeroCreditCheck).length,
    });
  }

  if (!settings.discovery_source_urls?.length && !configuredProviders.length) {
    await service.from("app_settings").update({
      discovery_status: "Waiting for sources",
      discovery_message: "Add a direct company board or configure at least one web-search provider.",
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    return json(request, { skipped: true, reason: "No discovery source is configured" });
  }

  let localDate = "";
  if (action === "scheduled") {
    let clock;
    try { clock = localClock(settings.discovery_timezone || "Asia/Singapore"); }
    catch { return json(request, { error: "Invalid discovery timezone" }, 400); }
    localDate = clock.date;
    const [hour, minute] = (settings.discovery_time || "08:00").split(":").map(Number);
    const target = hour * 60 + minute;
    const isDue = clock.minutes >= target;
    if (!isDue || settings.last_scheduled_discovery_date === localDate) {
      return json(request, {
        skipped: true,
        reason: settings.last_scheduled_discovery_date === localDate
          ? "Today's scheduled scan is already complete. Use Fetch now to run another manual scan."
          : "The scheduled time has not arrived yet. Use Fetch now for an immediate manual scan.",
      });
    }
  }

  const parsedSources = settings.discovery_source_urls.map(parseSource).filter(Boolean) as NonNullable<ReturnType<typeof parseSource>>[];
  const failures: string[] = [];
  const allCandidates: Candidate[] = [];
  const sourceResults = await Promise.all(parsedSources.map(async (source) => {
    try {
      const rows = source.platform === "Greenhouse"
        ? await fetchGreenhouse(source.slug, source.sourceUrl)
        : await fetchLever(source.slug, source.sourceUrl);
      return { rows, error: null };
    } catch (error) {
      return { rows: [] as Candidate[], error: error instanceof Error ? error.message : `Could not read ${source.sourceUrl}` };
    }
  }));
  for (const result of sourceResults) {
    allCandidates.push(...result.rows);
    if (result.error) failures.push(result.error);
  }

  const targetLocation = settings.discovery_location?.trim() || "Singapore";
  const targetCountry = settings.discovery_country?.trim().toLowerCase() || "singapore";
  const webQueries = buildWebQueries(settings.discovery_search_queries ?? [], targetLocation);
  let tavilyUsage: { usage: number; limit: number; paygoUsage: number } | null = null;
  let webSearchRan = false;
  let providerUsed: SearchProvider | null = null;
  let successfulProviders = 0;
  let providersWithResults = 0;
  let rawWebHits = 0;
  const webCandidates: Candidate[] = [];
  const providerAttempts: ProviderAttempt[] = [];
  if (configuredProviders.length && webQueries.length) {
    for (const provider of configuredProviders) {
      const apiKey = providerKeys[provider]!;
      try {
        if (provider === "tavily") {
          tavilyUsage = await fetchTavilyUsage(apiKey);
          const safetyCap = Math.min(settings.discovery_monthly_credit_cap ?? 900, tavilyUsage.limit || 1000);
          const estimatedCredits = webQueries.length + Math.ceil((webQueries.length * 12) / 5);
          if (tavilyUsage.usage + estimatedCredits > safetyCap) {
            providerAttempts.push({
              provider,
              status: "skipped",
              reason: `Safety cap reached at ${tavilyUsage.usage} of ${safetyCap} credits`,
              results: 0,
            });
            continue;
          }
        }

        const webResults = await Promise.all(webQueries.map(async (query) => {
          try {
            return { rows: await searchProvider(provider, query, apiKey, targetLocation, targetCountry), error: null };
          } catch (error) {
            return { rows: [] as WebResult[], error: error instanceof Error ? error.message : `Could not search for ${query}` };
          }
        }));
        const successfulQueries = webResults.filter((result) => !result.error).length;
        if (!successfulQueries) {
          throw new Error(webResults.find((result) => result.error)?.error || `${provider} did not complete any query`);
        }
        const rawSearchHits = webResults.flatMap((result) => result.rows);
        const searchHits = interleaveUniqueResults(webResults.map((result) => result.rows));
        rawWebHits += rawSearchHits.length;
        let extractedCandidates: Candidate[] = [];
        if (searchHits.length) {
          extractedCandidates = await extractWebResults(searchHits, provider === "tavily" ? apiKey : null, targetLocation, provider);
          allCandidates.push(...extractedCandidates);
          webCandidates.push(...extractedCandidates);
          providersWithResults += 1;
        }
        providerUsed = provider;
        webSearchRan = true;
        successfulProviders += 1;
        const eligibleWebCandidates = [...new Map(webCandidates.map((candidate) => [canonicalUrl(candidate.jobUrl), candidate])).values()]
          .filter((candidate) => assessEligibility(
            candidate,
            settings.discovery_max_required_years ?? 1,
            targetLocation,
            targetCountry,
            settings.discovery_target_role_keywords ?? [],
            settings.discovery_excluded_title_keywords ?? [],
          ).eligible).length;
        providerAttempts.push({
          provider,
          status: "used",
          reason: `${successfulQueries} of ${webQueries.length} queries completed, ${rawSearchHits.length} raw hits, ${searchHits.length} unique job pages, ${eligibleWebCandidates} matching web listings so far`,
          results: searchHits.length,
          httpStatus: 200,
          checkedAt: new Date().toISOString(),
          zeroCreditCheck: false,
        });
        if (provider === "tavily") tavilyUsage = await fetchTavilyUsage(apiKey);
        const enoughCoverage = providersWithResults >= 2 && eligibleWebCandidates >= 16;
        if (enoughCoverage || successfulProviders >= 3) break;
      } catch (error) {
        providerAttempts.push({
          provider,
          status: "failed",
          reason: error instanceof Error ? error.message : `${provider} was unavailable`,
          results: 0,
          httpStatus: Number((error instanceof Error ? error.message : "").match(/\b([1-5]\d\d)\b/)?.[1]) || null,
          checkedAt: new Date().toISOString(),
          zeroCreditCheck: false,
        });
      }
    }

    if (!providerUsed) {
      failures.push(`All configured web providers were unavailable: ${providerAttempts.map((attempt) => `${attempt.provider} (${attempt.reason})`).join(", ")}`);
    }
  }

  const uniqueCandidates = [...new Map(allCandidates.map((candidate) => [canonicalUrl(candidate.jobUrl), candidate])).values()];
  const preliminaryAssessments = uniqueCandidates.map((candidate) => ({
    candidate,
    assessment: assessEligibility(
      candidate,
      settings.discovery_max_required_years ?? 1,
      targetLocation,
      targetCountry,
      settings.discovery_target_role_keywords ?? [],
      settings.discovery_excluded_title_keywords ?? [],
    ),
  }));
  const preliminaryEligible = preliminaryAssessments.filter(({ assessment }) => assessment.eligible).map(({ candidate }) => candidate);
  const checkedWebCandidates = await inspectWebCandidates(preliminaryEligible.filter((candidate) => /web discovery$/i.test(candidate.source)));
  const checkedWebByUrl = new Map(checkedWebCandidates.map((candidate) => [canonicalUrl(candidate.jobUrl), candidate]));
  const availabilityCheckedCandidates = preliminaryEligible.map((candidate) => checkedWebByUrl.get(canonicalUrl(candidate.jobUrl)) ?? candidate);
  const assessments = [
    ...preliminaryAssessments.filter(({ assessment }) => !assessment.eligible),
    ...availabilityCheckedCandidates.map((candidate) => ({
      candidate,
      assessment: assessEligibility(
        candidate,
        settings.discovery_max_required_years ?? 1,
        targetLocation,
        targetCountry,
        settings.discovery_target_role_keywords ?? [],
        settings.discovery_excluded_title_keywords ?? [],
      ),
    })),
  ];
  const eligible = assessments
    .filter(({ assessment }) => assessment.eligible)
    .map(({ candidate }) => candidate)
    .sort((left, right) => {
      const leftPriority = discoveryPriority(left);
      const rightPriority = discoveryPriority(right);
      return rightPriority.posted - leftPriority.posted
        || rightPriority.availability - leftPriority.availability
        || classify(right).score - classify(left).score;
    });
  const skippedByReason = assessments.filter(({ assessment }) => !assessment.eligible).reduce<Record<string, number>>((counts, { assessment }) => {
    counts[assessment.reason] = (counts[assessment.reason] ?? 0) + 1;
    return counts;
  }, {});
  const retiredReasons = new Map(
    assessments
      .filter(({ assessment }) => assessment.reason === "closed or expired listing"
        || assessment.reason === "stale posting"
        || assessment.reason.startsWith("posted more than "))
      .map(({ candidate, assessment }) => [canonicalUrl(candidate.jobUrl), assessment.reason]),
  );
  let retiredExisting = 0;
  for (const [dedupeKey, reason] of retiredReasons) {
    const { data } = await service.from("jobs").update({
      pipeline: "Rejected",
      approved_to_apply: false,
      gaps_risks: `Automatically retired because the latest scan found a ${reason}.`,
      last_seen_at: new Date().toISOString(),
    }).eq("dedupe_key", dedupeKey).eq("pipeline", "Discovered").select("id");
    retiredExisting += data?.length ?? 0;
  }
  const keys = eligible.map((candidate) => canonicalUrl(candidate.jobUrl));
  const existingKeys = new Set<string>();
  for (let index = 0; index < keys.length; index += 200) {
    const { data } = await service.from("jobs").select("dedupe_key").in("dedupe_key", keys.slice(index, index + 200));
    for (const row of data ?? []) if (row.dedupe_key) existingKeys.add(row.dedupe_key);
  }

  const unseen = eligible.filter((candidate) => !existingKeys.has(canonicalUrl(candidate.jobUrl)));
  const rows = unseen.map((candidate) => {
    const match = classify(candidate);
    return {
      company: candidate.company,
      position: candidate.position,
      role_track: match.track,
      match_score: match.score,
      match_level: match.level,
      sponsorship: "Unknown",
      location: candidate.location,
      work_mode: /remote/i.test(candidate.description) ? "Remote" : /hybrid/i.test(candidate.description) ? "Hybrid" : "Not specified",
      date_found: candidate.postedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      matched_skills: match.skills,
      gaps_risks: candidate.availability === "verified_open"
        ? `Availability checked: ${candidate.availabilityReason}. Confirm salary and employer sponsorship before applying.`
        : `Availability could not be independently confirmed: ${candidate.availabilityReason}. Open the listing before preparing the application.`,
      pipeline: "Discovered",
      approved_to_apply: false,
      employment_type: candidate.employmentType,
      source: candidate.source,
      job_url: candidate.jobUrl,
      career_page: candidate.careerPage,
      ats_platform: candidate.atsPlatform,
      source_external_id: candidate.externalId,
      dedupe_key: canonicalUrl(candidate.jobUrl),
      job_description: candidate.description || null,
      last_seen_at: new Date().toISOString(),
    };
  });

  let inserted = 0;
  if (rows.length) {
    const { data, error } = await service.from("jobs").upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
    if (error) return json(request, { error: error.message }, 500);
    inserted = data?.length ?? 0;
  }

  const repeated = eligible.filter((candidate) => existingKeys.has(canonicalUrl(candidate.jobUrl)));
  const refreshResults = await Promise.all(repeated.map((candidate) => service.from("jobs").update({
      company: candidate.company,
      position: candidate.position,
      location: candidate.location,
      employment_type: candidate.employmentType,
      source: candidate.source,
      career_page: candidate.careerPage,
      ats_platform: candidate.atsPlatform,
      source_external_id: candidate.externalId,
      job_description: candidate.description || null,
      ...(candidate.postedAt ? { date_found: candidate.postedAt.slice(0, 10) } : {}),
      last_seen_at: new Date().toISOString(),
    }).eq("dedupe_key", canonicalUrl(candidate.jobUrl))));
  const refreshed = refreshResults.filter((result) => !result.error).length;

  const now = new Date().toISOString();
  const learnedSourceMap = new Map<string, LearnedSource>();
  for (const source of settings.discovery_learned_sources ?? []) {
    if (source?.host && source?.company) learnedSourceMap.set(`${source.host}|${source.company}`.toLowerCase(), source);
  }
  const promotedFeeds = new Set<string>();
  if (settings.discovery_source_learning_enabled !== false) {
    for (const candidate of eligible.filter((item) => /web discovery$/i.test(item.source))) {
      const match = classify(candidate);
      if (match.score < 80) continue;
      let host = "";
      try { host = new URL(candidate.jobUrl).hostname.replace(/^www\./, ""); } catch { continue; }
      const key = `${host}|${candidate.company}`.toLowerCase();
      const previous = learnedSourceMap.get(key);
      const jobUrls = [...new Set([...(previous?.jobUrls ?? []), canonicalUrl(candidate.jobUrl)])].slice(-8);
      const feedUrl = repeatableFeed(candidate.jobUrl) || previous?.feedUrl || null;
      if (feedUrl) promotedFeeds.add(feedUrl);
      learnedSourceMap.set(key, {
        host,
        company: candidate.company,
        atsPlatform: candidate.atsPlatform,
        bestScore: Math.max(previous?.bestScore ?? 0, match.score),
        matches: jobUrls.length,
        lastSeen: now,
        feedUrl,
        promoted: Boolean(feedUrl),
        jobUrls,
      });
    }
  }
  const learnedSources = [...learnedSourceMap.values()]
    .sort((left, right) => right.bestScore - left.bestScore || right.lastSeen.localeCompare(left.lastSeen))
    .slice(0, 40);
  const nextDirectSources = [...new Set([...(settings.discovery_source_urls ?? []), ...promotedFeeds])].slice(0, 60);
  const attemptedSources = parsedSources.length + (configuredProviders.length ? 1 : 0);
  const checkedSources = parsedSources.length + (webSearchRan ? 1 : 0);
  const previousProviderStatuses = new Map((settings.discovery_provider_status ?? []).map((item) => [item.provider, item]));
  const currentProviderStatuses = new Map(providerAttempts.map((item) => [item.provider, item]));
  const mergedProviderStatuses = DEFAULT_PROVIDER_ORDER.map((provider) => currentProviderStatuses.get(provider)
    ?? previousProviderStatuses.get(provider)
    ?? {
      provider,
      status: "skipped" as const,
      reason: providerKeys[provider] ? "Saved key has not been checked yet" : "No saved key",
      results: 0,
      httpStatus: null,
      checkedAt: null,
      zeroCreditCheck: false,
    });
  const status = attemptedSources > 0 && failures.length >= attemptedSources ? "Source error" : "Completed";
  const skipped = uniqueCandidates.length - eligible.length;
  const verifiedOpen = eligible.filter((candidate) => candidate.availability === "verified_open").length;
  const availabilityUnknown = eligible.filter((candidate) => candidate.availability === "unknown").length;
  const closedSkipped = assessments.filter(({ assessment }) => assessment.reason === "closed or expired listing").length;
  const newlyPromoted = nextDirectSources.length - (settings.discovery_source_urls?.length ?? 0);
  const message = `Scan completed: ${inserted} new, ${eligible.length - inserted} matching listings refreshed or already tracked. Reviewed ${uniqueCandidates.length} unique listings, including ${webCandidates.length} web candidates from ${rawWebHits} raw web hits; ${skipped} did not meet the active filters. Availability was confirmed for ${verifiedOpen} matching listings, ${availabilityUnknown} could not be independently confirmed, and ${closedSkipped} closed or expired listings were blocked. ${checkedSources} source type${checkedSources === 1 ? "" : "s"} checked.`
    + (retiredExisting > 0 ? ` ${retiredExisting} previously discovered stale or closed listing${retiredExisting === 1 ? " was" : "s were"} moved to Rejected.` : "")
    + (newlyPromoted > 0 ? ` ${newlyPromoted} reusable direct feed${newlyPromoted === 1 ? "" : "s"} learned from 80+ matches.` : "")
    + (failures.length ? ` ${failures.length} source${failures.length === 1 ? "" : "s"} need attention.` : "");
  await service.from("app_settings").update({
    last_discovery_at: now,
    last_scheduled_discovery_date: action === "scheduled" ? localDate : settings.last_scheduled_discovery_date,
    discovery_status: status,
    discovery_message: message,
    discovery_last_credit_usage: tavilyUsage?.usage ?? null,
    discovery_last_credit_limit: tavilyUsage?.limit ?? null,
    discovery_last_provider: providerUsed,
    discovery_provider_status: mergedProviderStatuses,
    discovery_source_urls: nextDirectSources,
    discovery_learned_sources: learnedSources,
    updated_at: now,
  }).eq("id", 1);

  return json(request, {
    scanned: uniqueCandidates.length,
    eligible: eligible.length,
    inserted,
    duplicates: eligible.length - inserted,
    refreshed,
    sources: checkedSources,
    webSearchConfigured: configuredProviders.length > 0,
    webSearchProvider: providerUsed,
    webSearchRan,
    providerAttempts,
    searchFunnel: {
      queries: webQueries.length,
      providersChecked: providerAttempts.filter((attempt) => attempt.status === "used").length,
      rawWebHits,
      webCandidates: webCandidates.length,
      uniqueListings: uniqueCandidates.length,
      eligible: eligible.length,
      newListings: inserted,
      duplicates: eligible.length - inserted,
      filteredOut: skipped,
      verifiedOpen,
      availabilityUnknown,
      closedOrExpired: closedSkipped,
    },
    learnedSources: learnedSources.length,
    promotedSources: newlyPromoted,
    retiredExisting,
    targetLocation,
    tavilyUsage,
    skipped,
    skippedByReason,
    sourceErrors: failures,
  });
});
