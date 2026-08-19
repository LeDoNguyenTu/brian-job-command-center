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
  last_scheduled_discovery_date: string | null;
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
};

type GreenhouseJob = {
  id?: string | number;
  title?: string;
  absolute_url?: string;
  content?: string;
  location?: { name?: string };
};

type LeverJob = {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  additionalPlain?: string;
  categories?: { location?: string; commitment?: string };
};

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

async function fetchGreenhouse(slug: string, sourceUrl: string): Promise<Candidate[]> {
  const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`, {
    headers: { "User-Agent": "Brian-Job-Command-Center/1.0" },
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
  })).filter((job: Candidate) => job.jobUrl);
}

async function fetchLever(slug: string, sourceUrl: string): Promise<Candidate[]> {
  const response = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`, {
    headers: { "User-Agent": "Brian-Job-Command-Center/1.0" },
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
  })).filter((job: Candidate) => job.jobUrl);
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

function isEligible(candidate: Candidate) {
  const title = candidate.position.toLowerCase();
  const text = `${candidate.position} ${candidate.location} ${candidate.description}`.toLowerCase();
  const location = candidate.location.toLowerCase();
  const seniorTitle = /\b(senior|sr\.?|staff|principal|lead|manager|head|director|vice president|vp)\b/.test(title);
  const mandatoryMandarin = /mandarin.{0,35}(required|mandatory|must|essential)/.test(text)
    || /(required|mandatory|must|essential).{0,35}mandarin/.test(text)
    || /chinese language.{0,35}(required|mandatory|must)/.test(text);
  const restrictedResidency = /(only|must be|restricted to|open only to).{0,45}(singaporean|singapore citizen|permanent resident|singapore pr)/.test(text)
    || /(singaporean|singapore citizen|permanent resident|singapore pr).{0,30}(only|required|must)/.test(text);
  const singaporeBased = /singapore/.test(location);
  return singaporeBased && !seniorTitle && !mandatoryMandarin && !restrictedResidency;
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
  const score = Math.min(92, 60 + skills.length * 5 + (earlyCareer ? 12 : 0));
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
  const action = body.action === "scheduled" ? "scheduled" : body.action === "maintenance" ? "maintenance" : "manual";

  if (action === "scheduled" || action === "maintenance") {
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
    .select("discovery_enabled, discovery_time, discovery_timezone, discovery_source_urls, last_scheduled_discovery_date")
    .eq("id", 1)
    .single();
  if (settingsError) return json(request, { error: settingsError.message }, 500);
  const settings = settingsData as DiscoverySettings;

  if (!settings.discovery_enabled && action === "scheduled") return json(request, { skipped: true, reason: "Discovery is paused" });
  if (!settings.discovery_source_urls?.length) {
    await service.from("app_settings").update({
      discovery_status: "Waiting for sources",
      discovery_message: "Add at least one Greenhouse or Lever company career page.",
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    return json(request, { skipped: true, reason: "No supported career pages configured" });
  }

  let localDate = "";
  if (action === "scheduled") {
    let clock;
    try { clock = localClock(settings.discovery_timezone || "Asia/Singapore"); }
    catch { return json(request, { error: "Invalid discovery timezone" }, 400); }
    localDate = clock.date;
    const [hour, minute] = (settings.discovery_time || "08:00").split(":").map(Number);
    const target = hour * 60 + minute;
    const isDue = clock.minutes >= target && clock.minutes < target + 5;
    if (!isDue || settings.last_scheduled_discovery_date === localDate) {
      return json(request, { skipped: true, reason: settings.last_scheduled_discovery_date === localDate ? "Already completed today" : "Not due" });
    }
  }

  const parsedSources = settings.discovery_source_urls.map(parseSource).filter(Boolean) as NonNullable<ReturnType<typeof parseSource>>[];
  const failures: string[] = [];
  const allCandidates: Candidate[] = [];
  for (const source of parsedSources) {
    try {
      const rows = source.platform === "Greenhouse"
        ? await fetchGreenhouse(source.slug, source.sourceUrl)
        : await fetchLever(source.slug, source.sourceUrl);
      allCandidates.push(...rows);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : `Could not read ${source.sourceUrl}`);
    }
  }

  const uniqueCandidates = [...new Map(allCandidates.map((candidate) => [canonicalUrl(candidate.jobUrl), candidate])).values()];
  const eligible = uniqueCandidates.filter(isEligible);
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
      date_found: new Date().toISOString().slice(0, 10),
      matched_skills: match.skills,
      gaps_risks: "Confirm role requirements, salary, and employer sponsorship before applying.",
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
      last_seen_at: new Date().toISOString(),
    }).eq("dedupe_key", canonicalUrl(candidate.jobUrl))));
  const refreshed = refreshResults.filter((result) => !result.error).length;

  const now = new Date().toISOString();
  const status = failures.length === parsedSources.length ? "Source error" : "Completed";
  const message = `${inserted} new, ${eligible.length - inserted} already tracked or repeated. ${parsedSources.length} source${parsedSources.length === 1 ? "" : "s"} checked.`
    + (failures.length ? ` ${failures.length} source${failures.length === 1 ? "" : "s"} need attention.` : "");
  await service.from("app_settings").update({
    last_discovery_at: now,
    last_scheduled_discovery_date: action === "scheduled" ? localDate : settings.last_scheduled_discovery_date,
    discovery_status: status,
    discovery_message: message,
    updated_at: now,
  }).eq("id", 1);

  return json(request, {
    scanned: uniqueCandidates.length,
    eligible: eligible.length,
    inserted,
    duplicates: eligible.length - inserted,
    refreshed,
    sources: parsedSources.length,
    sourceErrors: failures,
  });
});
