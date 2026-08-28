# APAC Source-First Job Discovery Design

## Purpose

Replace the current search-result scraper with a trustworthy, self-expanding APAC job index for one user. The system must continuously discover legitimate recruitment sources, collect open jobs from official employer infrastructure and accessible recruitment marketplaces, normalize and verify them, filter them for the user's eligibility, and operate without ChatGPT or a ChatGPT subscription.

The target behavior is Jobright-like discovery and matching at personal scale. The system does not need Jobright's global inventory or commercial crawling infrastructure, but it should have a high probability of finding a relevant publicly accessible APAC vacancy without requiring the employer or ATS to be hardcoded in advance.

## Current Problems

Production inspection on 27 August 2026 found these concrete failures:

- 17 of 19 active discovered jobs were not independently verified open.
- 10 of 19 active jobs originated from suspicious free-hosting domains instead of official employers or trusted recruitment platforms.
- Every query parameter is removed during URL canonicalization. This collapses provider identities such as Indeed's `jk` job identifier.
- An unknown publication date can be replaced with the discovery date, making an old listing appear newly posted.
- General web search is treated as the inventory instead of a source-discovery mechanism.
- Only Greenhouse and Lever have reusable direct adapters.
- One `location` and `country` setting cannot represent multiple APAC markets.
- Search, extraction, verification, filtering, persistence, and source learning are coupled into one time-limited request.
- Existing duplicate records are refreshed without reliably refreshing their availability warning.

## Architecture

Use a persistent source registry and bounded incremental crawling.

1. Search engines, job boards, existing links, sitemaps, and employer directories discover possible recruitment sources.
2. A source fingerprinter classifies each source by infrastructure and trust evidence. Known ATS products are optimizations, not a whitelist.
3. Dedicated adapters handle common structured providers efficiently.
4. Generic structured and generic employer-page adapters handle unknown or custom recruitment infrastructure.
5. Accessible third-party job boards are treated as a separate verified-board source class and never impersonate the employer source.
6. Every adapter emits the same normalized job contract.
7. Trust, identity, publication date, market, and availability are resolved before personal eligibility filtering.
8. Only trusted and verified-open jobs enter the main Discovered queue. Unknown or suspicious candidates are quarantined.
9. Supabase Cron invokes a bounded Edge Function orchestrator every five minutes. Each run leases only due sources and stays below platform limits.
10. Search providers discover new sources and refresh source intelligence. Search results cannot directly create jobs.

This provides open-ended source compatibility while keeping every execution bounded and auditable.

## Source Classes

Every source belongs to one of these classes:

- `direct_structured`: official ATS API, public feed, employer JSON API, or structured career endpoint.
- `generic_employer`: official employer career infrastructure parsed through JSON-LD, embedded hydration data, generic JSON, sitemaps, or bounded HTML traversal.
- `verified_board`: accessible third-party recruitment marketplace with a verifiable active vacancy.
- `quarantine`: untrusted, malformed, deceptive, unverifiable, or unsupported candidate.

The source registry is data-driven. Adding a new employer is a database operation, not a code deployment.

## Source Fingerprinting

The resolver must not depend on literal hostnames alone. It can use:

- hostname and path patterns;
- redirects and canonical links;
- HTML generator and vendor markers;
- script URLs and static asset hosts;
- form actions and application endpoints;
- embedded JSON configuration;
- JSON-LD `JobPosting` metadata;
- known public API path signatures;
- hydration payloads such as Next.js or Nuxt data;
- verified employer-domain evidence.

Recognized provider families initially include Greenhouse, Lever, Workday and MyWorkdayJobs, Ashby, SmartRecruiters, SAP SuccessFactors, Oracle Recruiting Cloud and Taleo, iCIMS, PageUp, Workable, Recruitee, Teamtailor, Jobvite, Avature, Phenom, Eightfold, BambooHR, Personio, and generic employer infrastructure. This list is a fingerprint catalog, not an allowlist. Unknown legitimate employer sites must continue through generic adapters.

## Adapter Strategy

Dedicated bootstrap adapters:

- Greenhouse public Job Board API;
- Lever public Postings API;
- Ashby public job board endpoints;
- SmartRecruiters public postings endpoints;
- Workday candidate-experience endpoints behind an isolated adapter because interfaces vary by tenant.

Generic adapters:

- `jsonld`: parse current `JobPosting` metadata from official pages;
- `embedded_json`: recursively inspect bounded hydration or application JSON for job records;
- `generic_employer_html`: discover bounded job-detail links from an official career source and parse detail pages;
- `verified_board`: ingest an accessible board vacancy with lower trust than an official employer source;
- `rendered_fallback`: optional provider-assisted extraction for JavaScript-only sources when a configured rendering/extraction provider is available.

A newly discovered ATS does not block ingestion. It falls through to a generic adapter. If the same fingerprint becomes common, it can later be promoted to a dedicated adapter without changing downstream contracts.

## Normalized Job Contract

Every adapter returns:

- `sourceId`;
- `sourceClass`;
- `provider`;
- `providerJobId`;
- `canonicalUrl`;
- `applyUrl`;
- `company`;
- `title`;
- `locations`;
- `countryCodes`;
- `employmentType`;
- `descriptionText`;
- `postedAt`;
- `validThrough`;
- `availabilityStatus`;
- `availabilityEvidence`;
- `retrievedAt`.

Adapters must not invent values. Unknown dates remain null. Unknown employment types remain null. A job is `verified_open` when it is present in a successful live official feed, an official page has a current application action or valid current `JobPosting` metadata, or a verified-board adapter confirms the vacancy is currently active. Temporary blocks are `verification_pending`, never evidence that a vacancy is open or closed.

## Identity and Deduplication

Identity is provider-aware:

- use stable provider job or requisition IDs when available;
- preserve identity-bearing query parameters such as Indeed `jk`;
- remove only known tracking parameters such as `utm_*`, `tracking`, campaign and referral identifiers;
- preserve URL path case;
- prefer the official employer URL over a syndicated board URL;
- use normalized company, title, location, and source only as a fallback fingerprint.

Primary uniqueness is `(source_id, provider_job_id)` when both exist, otherwise canonical URL, otherwise the fallback fingerprint.

## Source Registry

Create `public.discovery_sources` with one row per repeatable source. Store:

- stable source id;
- company and display name;
- canonical source URL and verified employer host when known;
- source class;
- detected provider and adapter;
- detector confidence and fingerprint evidence;
- market codes and location aliases;
- non-secret adapter configuration;
- trust level;
- enabled state;
- crawl cadence and `next_crawl_at`;
- last attempt and success timestamps;
- consecutive failure count and last bounded error summary;
- discovery provenance.

The registry can grow to thousands of sources without source-code changes.

## Persistence and Lifecycle

Add lifecycle fields to `public.jobs` without deleting existing fields:

- `source_id`;
- `provider_job_id`;
- `canonical_url`;
- `posted_at`;
- `first_seen_at`;
- `last_seen_at`;
- `last_verified_at`;
- `availability_status`;
- `availability_evidence`;
- `source_trust`;
- `source_class`;
- `market_code`;
- `missing_from_source_count`.

Create `public.discovery_runs` for run metrics and `public.discovery_quarantine` for rejected or unverifiable candidates. All exposed tables use RLS and admin-scoped policies.

Lifecycle rules:

- `first_seen_at` is set once;
- `last_seen_at` refreshes on successful source observation;
- `posted_at` never falls back to discovery time;
- a job missing from a successfully fetched source increments `missing_from_source_count`;
- two consecutive successful omissions can close an untouched Discovered job;
- manually managed pipelines such as Applied, Interview, and Offer are never automatically overwritten by source disappearance;
- failed source crawls never close jobs;
- quarantine never appears in the main feed.

## APAC Markets and Eligibility

Supported initial market codes are `SG`, `VN`, `MY`, `TH`, `ID`, and `PH`, with Singapore enabled after migration. Additional market codes can be added later without redesigning source acquisition.

Jobs are acquired and normalized before personal eligibility filtering. Structured locations take precedence over text inference. Singapore-specific citizenship, PR, sponsorship, S Pass, and mandatory Mandarin rules apply only to Singapore roles. General role, seniority, experience, employment type, and language rules apply across markets.

Only eligible, verified-open jobs become new Discovered records. Existing manually managed jobs remain preserved.

## Scheduling and Failure Isolation

Supabase Cron invokes the orchestrator every five minutes. Current Supabase guidance supports scheduled Edge Function invocation through Cron, pg_net, and Vault-backed secrets. Hosted Edge Functions have bounded wall-clock and request-idle limits, so the orchestrator must lease small batches rather than crawl the entire registry in one request.

Scheduled behavior:

- lease a bounded batch of due sources;
- refresh valuable structured sources approximately every two hours with deterministic jitter;
- run source discovery once daily after the configured local time;
- crawl slower generic pages in smaller batches;
- record run and source health metrics;
- release leases even when an adapter fails;
- never let one source failure abort other sources.

Manual Fetch runs the same pipeline with a larger but still bounded lease. It never bypasses trust, availability, or eligibility rules.

## Search and Board Discovery

Tavily, Exa, Firecrawl, Brave, SerpApi, Serper and other configured discovery providers are source radar, not the job database. They may discover:

- official employer career roots;
- ATS tenant URLs;
- public job-board vacancy URLs;
- sitemaps and job indexes;
- previously unseen custom recruitment infrastructure.

A search hit must pass source resolution and trust assessment before it becomes a reusable source. Search snippets never create main-feed jobs directly.

When a verified board vacancy links or maps to an official employer vacancy, the official employer record becomes canonical.

## Dashboard

Settings gains:

- APAC market toggles;
- source health summary;
- source-class and adapter counts;
- failing and due source counts;
- latest run metrics;
- quarantine metrics.

The main feed defaults to trusted verified-open jobs. Job detail shows source, source class, provider, posting date when known, first seen, last verified, and availability evidence. Unknown posting dates display `Date unavailable`.

## Security and Privacy

- Discovery code never calls OpenAI, ChatGPT, or a ChatGPT scheduled task.
- Search and extraction provider keys remain encrypted and server-only.
- Supabase service credentials never enter browser code or logs.
- Public-schema tables have RLS enabled and explicit policies.
- Privileged leasing helpers revoke execution from `PUBLIC` and grant only the required service role.
- Scheduled requests retain secret validation.
- Employer HTML and JSON are untrusted input, never executed, and are size-bounded and sanitized before storage.
- The crawler does not bypass authentication, CAPTCHA, paywalls, robots restrictions, or anti-bot controls.

## Deployment and Rollback

Deployment is additive:

1. Add registry, lifecycle, run, quarantine and market schema.
2. Deploy core classifiers and adapters while preserving existing authentication and settings.
3. Run source-first dry runs without changing the visible queue.
4. Compare source-first output against the current queue.
5. Enable source-first writes only after dry-run validation.
6. Quarantine suspicious untouched Discovered records without changing Applied or later pipelines.
7. Update the dashboard and source health controls.
8. Verify Cron reaches the source-first function independently of ChatGPT.

Rollback disables source-first writes and restores the previous function version. Additive schema remains safe to retain.

## Acceptance Criteria

- Daily and incremental scans work without ChatGPT, OpenAI, or a ChatGPT subscription.
- Source compatibility is not limited to a hardcoded employer or ATS allowlist.
- Unknown legitimate employer career infrastructure can be ingested through a generic adapter when safely parseable.
- Search results cannot directly create a job in the Discovered queue.
- No suspicious free-hosting, shortener, deceptive, or untrusted mirror domain enters Discovered.
- Direct structured sources target 100 percent `verified_open` for newly inserted jobs.
- Unknown posting dates remain null and render as `Date unavailable`.
- Distinct Indeed `jk` values, Workday requisitions, ATS IDs, and case-sensitive paths do not collide.
- A source failure cannot close jobs or abort other source adapters.
- Two successful source omissions close only untouched Discovered jobs.
- Singapore, Vietnam, Malaysia, Thailand, Indonesia, and the Philippines normalize correctly.
- The registry can add a new official employer source without a code deployment.
- Existing applications, decisions, resumes, PDFs, provider keys, and manually managed pipeline states remain unchanged.
- Tests, TypeScript, lint, build, database advisors, Edge logs, and live dry-run evidence are green before cutover.

## Non-Goals

- Reproducing Jobright's commercial global inventory volume.
- Scraping authenticated LinkedIn or other protected sessions.
- Bypassing CAPTCHA or anti-bot controls.
- Automatically submitting applications.
- Requiring an LLM to decide whether a source is legitimate or a vacancy is open.
