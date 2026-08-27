# APAC Source-First Job Discovery Design

## Purpose

Replace the current search-result scraper with a trustworthy APAC job ingestion system. The new system must continuously collect open jobs from official employer and ATS sources, preserve accurate identity and dates, filter them for Brian's actual eligibility, and operate without ChatGPT or a ChatGPT subscription.

The rebuild covers discovery, normalization, deduplication, availability checks, scheduling, source health, market selection, migration of existing records, and dashboard reporting. It does not add automatic application submission or cross-site form filling.

## Current Problems

The existing Edge Function combines general web search results with permissive URL heuristics and regex filters. Production inspection on 27 August 2026 found these concrete failures:

- 17 of 19 active discovered jobs were not independently verified open.
- 10 of 19 active jobs originated from suspicious free-hosting domains instead of official employers or trusted ATS platforms.
- Every query parameter is removed during URL canonicalization. This collapses provider identities such as Indeed's `jk` job identifier.
- An unknown publication date can be replaced with the discovery date, making an old listing appear newly posted.
- Web search is treated as the main inventory instead of a source-discovery fallback.
- Only Greenhouse and Lever are reusable direct adapters.
- One `location` and `country` setting cannot represent multiple APAC markets.
- The scheduled function performs search, extraction, verification, filtering, persistence, and learning in one time-limited request.
- Existing duplicate records are refreshed without reliably refreshing their availability warning.

## Chosen Architecture

Use a source-first pipeline backed by a persistent registry and incremental scheduled runs.

1. Official ATS feeds and employer career pages are the authoritative inventory.
2. Search providers discover new official sources, not arbitrary job mirrors.
3. Each adapter emits one normalized job contract.
4. Trust, identity, publication date, and availability are resolved before eligibility scoring.
5. Only verified open jobs from trusted sources enter the main Discovered queue.
6. Unknown or untrusted candidates are quarantined and never presented as recommended jobs.
7. Supabase Cron invokes a small orchestrator every five minutes. The orchestrator leases only due sources and keeps each execution bounded.
8. The system supports multiple APAC markets, with Singapore enabled by default and Vietnam, Malaysia, Thailand, Indonesia, and the Philippines available in Settings.

This approach is selected over a larger web-search loop because it improves correctness, freshness, repeatability, and independence from paid search quotas. It is selected over a full browser-crawling farm because this is a personal application and should remain maintainable on low-cost infrastructure.

## Source Registry

Create `public.discovery_sources` with one row per repeatable source. Each row stores:

- stable source identifier;
- adapter type;
- display name and company;
- canonical source URL;
- country code and location aliases;
- adapter configuration without credentials;
- trust level;
- enabled state;
- crawl cadence and `next_crawl_at`;
- last attempted and successful timestamps;
- consecutive failure count and last error summary;
- source-discovery provenance.

Initial adapters:

- Greenhouse public Job Board API;
- Lever public Postings API;
- Ashby public job-board API;
- SmartRecruiters public postings API;
- Workday public candidate-experience JSON endpoints, isolated behind a provider adapter because the interface is less stable;
- generic official career-page `JobPosting` JSON-LD for sources without a feed.

The existing Greenhouse and Lever URLs are migrated into this registry. Search results may add a new source only when the URL resolves to a supported ATS pattern or an official company career host. Free-hosting services, URL shorteners, content mirrors, aggregators, and domains without employer ownership evidence are rejected.

## Normalized Job Contract

Every adapter returns the same fields:

- `sourceId`;
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

Adapters must not invent values. Unknown dates remain null. Unknown employment types remain null. A job is `verified_open` when it is present in a successful live ATS feed or its official page contains a current application action or valid `JobPosting` metadata. A temporary block is `verification_pending`, never evidence that a job is open or closed.

## Identity and Deduplication

Identity is provider-aware:

- use the provider's stable job or requisition ID when available;
- preserve identity-bearing query parameters such as `jk`;
- remove only known tracking parameters such as `utm_*`, `tracking`, `ref`, and social campaign identifiers;
- retain URL path case;
- use normalized company, title, location, and source as a fallback fingerprint only when no provider ID exists.

The primary uniqueness rule is `(source_id, provider_job_id)` when both values exist. The fallback is `canonical_url`. Syndicated board links do not override a previously known official employer link.

## Persistence and Lifecycle

Add these fields to `public.jobs` without deleting existing columns:

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
- `market_code`;
- `missing_from_source_count`.

Create `public.discovery_runs` for run-level and source-level metrics. Create `public.discovery_quarantine` for untrusted, malformed, or unverifiable web candidates. Both tables use row-level security and admin-only policies.

Lifecycle rules:

- a newly observed verified job receives `first_seen_at` once and updates `last_seen_at` on every successful source crawl;
- `posted_at` never falls back to `first_seen_at`;
- a job removed from a successfully fetched source increments `missing_from_source_count`;
- two consecutive successful source crawls that omit the job mark it closed, unless it is already in a manually managed pipeline such as Applied, Interview, or Offer;
- an explicitly closed page can close a Discovered job immediately;
- a failed source crawl never closes or ages out jobs;
- quarantined candidates never appear in the main job feed.

## APAC Markets and Eligibility

Replace the single location setting with an array of market configurations. Supported initial market codes are `SG`, `VN`, `MY`, `TH`, `ID`, and `PH`. Singapore remains enabled after migration. Other markets are opt-in through Settings.

Each market defines country and city aliases. Matching uses structured adapter locations first and text inference only as a fallback. Singapore-specific sponsorship, citizenship, PR, S Pass, and mandatory Mandarin rules apply only to Singapore roles. General role, seniority, experience, employment type, and verified-language filters continue across markets.

Jobs are ingested before personal eligibility filtering. This prevents incomplete search snippets from discarding a valid role before its official record is parsed. Eligibility produces an explicit decision and reason list. Only eligible, verified-open jobs become Discovered records.

## Scheduling and Failure Isolation

Keep the existing Supabase Cron runner. It invokes the Edge Function every five minutes with service authentication.

Scheduled behavior:

- lease a bounded batch of due official sources on every invocation;
- refresh high-value sources approximately every two hours with deterministic jitter;
- run web source discovery once daily after the configured local time;
- verify due generic pages in small batches;
- record one run row with per-source counters and errors;
- release leases even when an adapter fails;
- never let one provider failure abort other sources.

Manual Fetch runs the same pipeline with a larger but bounded due-source batch. It does not bypass trust or eligibility rules.

Search providers retain their current failover order and credit controls. Their results can propose supported ATS roots or official employer career domains. They cannot insert jobs directly.

## Dashboard Changes

Settings gains a compact APAC market selector and a source-health summary. Existing provider-key controls remain.

Discovery status reports:

- trusted sources due and healthy;
- sources failing;
- verified-open jobs found;
- duplicates refreshed;
- jobs closed after disappearance;
- candidates quarantined;
- new sources learned;
- search-provider usage.

The main job feed shows only trusted, verified-open jobs by default. Existing manually managed jobs remain visible regardless of later source availability. A job detail view shows source, posting date when known, first seen, last verified, and availability evidence.

## Security and Privacy

- No discovery code calls OpenAI, ChatGPT, or a ChatGPT task.
- Search-provider keys remain encrypted and server-only.
- Supabase service credentials never enter browser code or logs.
- New exposed tables have RLS enabled and admin-scoped policies.
- Scheduled requests retain the existing secret validation.
- Error logs exclude API keys, authorization headers, full resumes, and sensitive personal profile fields.
- Employer pages are treated as untrusted input. HTML is never executed, and stored text is bounded and sanitized.

## Migration and Rollback

Deployment is additive and ordered:

1. Create the new tables, columns, constraints, policies, and seed source registry.
2. Deploy the modular Edge Function while preserving existing function actions and authentication.
3. Run a dry-run source crawl that writes metrics and quarantine rows but does not change the visible queue.
4. Compare direct-source output with the current queue.
5. Enable source-first writes and quarantine the suspicious current Discovered records.
6. Update the dashboard for market and health reporting.

Existing applications, decisions, resumes, generated PDFs, provider keys, and manually managed pipelines are preserved. Rollback disables source-first writes and restores the previous Edge Function version. Additive schema remains harmless if rollback is needed.

## Acceptance Criteria

- The daily website scan completes without any ChatGPT task or OpenAI API dependency.
- The repository includes the cron configuration or a migration that reconciles the live cron job.
- No suspicious free-hosting or untrusted mirror domain can enter Discovered.
- At least 90 percent of newly inserted Discovered jobs are `verified_open`; the target is 100 percent for direct ATS feeds.
- An unknown posting date remains null and is displayed as `Date unavailable` rather than today.
- Provider identity tests prove that distinct Indeed `jk` values, Workday requisitions, and ATS IDs do not collide.
- Removing tracking parameters does not change an identity-bearing URL.
- A source failure cannot close jobs or abort other adapters.
- Two successful source omissions close only untouched Discovered jobs.
- Singapore, Vietnam, and Malaysia location normalization passes fixture tests, with Thailand, Indonesia, and the Philippines covered by aliases and settings tests.
- Search-provider results can register a supported official source but cannot directly insert a job.
- All existing regression tests, TypeScript, lint, and production build pass.
- A controlled live run reports trusted sources, verified jobs, duplicates, closures, quarantines, and failures accurately.

## Non-Goals

- Reproducing Jobright's advertised global inventory volume.
- Scraping authenticated LinkedIn or Indeed pages or bypassing anti-bot controls.
- Automatically submitting applications.
- Building a browser extension in this rebuild.
- Using an LLM to decide whether a source is trustworthy or a vacancy is open.
