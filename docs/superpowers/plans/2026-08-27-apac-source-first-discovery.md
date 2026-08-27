# APAC Source-First Job Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace direct web-result ingestion with a self-expanding APAC job index that learns legitimate recruitment sources, verifies open vacancies, and runs independently of ChatGPT.

**Architecture:** Supabase Cron invokes a bounded source-first Edge Function. A source resolver fingerprints known ATS infrastructure but also supports unknown official employer sites through generic JSON-LD, embedded JSON and bounded HTML adapters. Search providers and accessible job boards discover candidate sources but cannot directly create main-feed jobs.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Node 22, Supabase Postgres/Auth/Edge Functions/Cron, Deno

**Spec:** `docs/superpowers/specs/2026-08-27-apac-source-first-discovery-design.md`

## Global Constraints

- Discovery never calls OpenAI, ChatGPT, or a ChatGPT scheduled task.
- Known ATS providers are adapter optimizations, never a source allowlist.
- Existing jobs, applications, decisions, resumes, generated PDFs, provider keys, and manually managed pipeline states are preserved.
- All database changes are additive until cutover.
- `SG`, `VN`, `MY`, `TH`, `ID`, and `PH` are supported initially, with Singapore enabled after migration.
- Only trusted and verified-open jobs can enter a new Discovered record.
- Unknown publication dates remain null.
- Search snippets never become jobs directly.
- Every implementation and documentation commit uses `[skip ci]`.
- No AI co-author attribution is added.

---

### Task 1: Establish executable discovery tests

**Files:**
- Modify: `package.json`
- Create: `tests/discovery-identity.test.ts`
- Create: `tests/discovery-trust.test.ts`
- Create: `tests/discovery-markets.test.ts`
- Create: `tests/discovery-source-classifier.test.ts`

**Interfaces:**
- Produces tests for `canonicalizeJobIdentity`, `assessSourceTrust`, `normalizeJobMarkets`, and `classifyRecruitmentSource`.

- [ ] Add `test:discovery` using Node 22 TypeScript stripping and `node --test`.
- [ ] Test URL tracking removal while preserving Indeed `jk`, ATS IDs, Workday requisition paths, and URL path case.
- [ ] Test trusted official ATS and verified employer hosts plus rejection of free-hosting, shorteners, aggregators, and deceptive subdomains.
- [ ] Test market normalization for all six initial APAC markets.
- [ ] Test source fingerprinting for Workday custom patterns, SuccessFactors custom-domain markers, Oracle/Taleo, iCIMS/PageUp, JSON-LD, embedded JSON and unknown official employer fallback.
- [ ] Run the focused tests and confirm they fail because the core modules are absent.
- [ ] Commit red tests with `[skip ci]`.

### Task 2: Implement core identity, trust, markets, classifier and eligibility

**Files:**
- Create: `supabase/functions/discover-jobs/core/types.ts`
- Create: `supabase/functions/discover-jobs/core/identity.ts`
- Create: `supabase/functions/discover-jobs/core/trust.ts`
- Create: `supabase/functions/discover-jobs/core/markets.ts`
- Create: `supabase/functions/discover-jobs/core/source-classifier.ts`
- Create: `supabase/functions/discover-jobs/core/eligibility.ts`
- Create: `tests/discovery-eligibility.test.ts`

**Interfaces:**
- `canonicalizeJobIdentity(input): JobIdentity`
- `assessSourceTrust(input): SourceTrustAssessment`
- `normalizeJobMarkets(locations): MarketCode[]`
- `classifyRecruitmentSource(input): SourceFingerprint`
- `assessEligibility(job, settings): EligibilityDecision`

- [ ] Implement minimum identity behavior required by Task 1 tests.
- [ ] Implement conservative trust assessment with provider fingerprints and verified-employer-host evidence.
- [ ] Implement APAC market aliases with structured location precedence.
- [ ] Implement source classification where known providers map to optimized adapters but unknown verified employer sites map to generic adapters.
- [ ] Run Task 1 tests until green.
- [ ] Add failing eligibility tests for seniority, experience limits, employment type, mandatory language and Singapore-only sponsorship restrictions.
- [ ] Implement deterministic eligibility decisions returning all reasons.
- [ ] Run all discovery core tests.
- [ ] Commit core domain layer with `[skip ci]`.

### Task 3: Add source registry and lifecycle schema

**Files:**
- Create: one timestamped `supabase/migrations/*_apac_source_first_discovery.sql`
- Create: `tests/discovery-schema.test.mjs`

**Interfaces:**
- Produces `discovery_sources`, `discovery_runs`, `discovery_quarantine`, additive job lifecycle columns, `discovery_markets`, source-leasing RPC and five-minute Cron reconciliation.

- [ ] Write schema assertions first and confirm the migration file is absent.
- [ ] Add `discovery_sources` fields for source class, provider, adapter, confidence, evidence, market codes, trust, cadence, leasing and health.
- [ ] Add `discovery_runs` and `discovery_quarantine` with bounded JSON fields.
- [ ] Add lifecycle fields to `jobs` without replacing existing columns or pipeline values.
- [ ] Add `discovery_markets` to `app_settings`, preserving Singapore.
- [ ] Add indexes for due-source leasing, provider identity and active verified jobs.
- [ ] Enable RLS on new public tables with admin-only policies.
- [ ] Create a service-only leasing function, revoke `PUBLIC`, and grant only `service_role`.
- [ ] Seed existing direct source URLs into the registry without credentials.
- [ ] Reconcile one named five-minute Cron invocation using Vault-backed project URL and scheduled secret.
- [ ] Run schema source tests.
- [ ] Commit migration with `[skip ci]`.

### Task 4: Implement source adapters and generic fallbacks

**Files:**
- Create: `supabase/functions/discover-jobs/adapters/types.ts`
- Create: `supabase/functions/discover-jobs/adapters/greenhouse.ts`
- Create: `supabase/functions/discover-jobs/adapters/lever.ts`
- Create: `supabase/functions/discover-jobs/adapters/ashby.ts`
- Create: `supabase/functions/discover-jobs/adapters/smartrecruiters.ts`
- Create: `supabase/functions/discover-jobs/adapters/workday.ts`
- Create: `supabase/functions/discover-jobs/adapters/jsonld.ts`
- Create: `supabase/functions/discover-jobs/adapters/embedded-json.ts`
- Create: `supabase/functions/discover-jobs/adapters/generic-employer-html.ts`
- Create: `supabase/functions/discover-jobs/adapters/verified-board.ts`
- Create: `supabase/functions/discover-jobs/adapters/index.ts`
- Create: `tests/discovery-adapters.test.ts`

**Interfaces:**
- `fetchSourceJobs(source, fetcher): Promise<AdapterResult>`
- All adapters emit `NormalizedJob[]` plus bounded health metadata.

- [ ] Write fixture tests before each adapter implementation.
- [ ] Implement structured provider adapters with response-size, redirect, pagination and timeout bounds.
- [ ] Implement JSON-LD extraction without executing page scripts.
- [ ] Implement bounded recursive extraction from embedded hydration/application JSON.
- [ ] Implement generic employer HTML discovery limited to official source origin and bounded job-detail links.
- [ ] Implement verified-board parsing as lower-trust than official employer sources.
- [ ] Route unknown legitimate employer infrastructure to generic adapters rather than rejecting it.
- [ ] Treat blocks and malformed payloads as source failures, never as evidence of closure.
- [ ] Run adapter and core tests.
- [ ] Commit adapters with `[skip ci]`.

### Task 5: Implement source learning and lifecycle reconciliation

**Files:**
- Create: `supabase/functions/discover-jobs/pipeline/source-discovery.ts`
- Create: `supabase/functions/discover-jobs/pipeline/reconcile.ts`
- Create: `supabase/functions/discover-jobs/pipeline/run.ts`
- Create: `tests/discovery-source-discovery.test.ts`
- Create: `tests/discovery-lifecycle.test.ts`

**Interfaces:**
- Search hits produce source proposals only.
- Reconciliation produces deterministic insert, refresh, close and quarantine operations.

- [ ] Test that web results cannot directly emit job inserts.
- [ ] Test new official employer domains can become reusable generic sources without a code deployment.
- [ ] Test source classification and trust evidence are persisted with proposals.
- [ ] Test first seen, last seen, null posted date, duplicate refresh, two successful omissions, failed-source protection and manual-pipeline protection.
- [ ] Implement source proposal normalization and source registration decisions.
- [ ] Implement lifecycle reconciliation.
- [ ] Implement bounded run planning for scheduled, manual, dry-run, maintenance and diagnostic actions.
- [ ] Test one failed source does not abort other sources.
- [ ] Commit pipeline with `[skip ci]`.

### Task 6: Replace the monolithic discovery orchestrator

**Files:**
- Modify: `supabase/functions/discover-jobs/index.ts`
- Create: `tests/discovery-function-source.test.mjs`

**Interfaces:**
- Preserves existing CORS, scheduled secret validation, signed-in admin authorization, encrypted provider-key retrieval and public HTTP actions.
- Routes acquisition through source registry and adapters.

- [ ] Add failing source-level tests for authorization, no direct web insertion, bounded leases, dry-run safety, run persistence and ChatGPT independence.
- [ ] Preserve `manual`, `scheduled`, `maintenance`, and `diagnostic`; add `dry-run`.
- [ ] Lease due registry sources and fetch each independently.
- [ ] Persist source health and aggregate run metrics.
- [ ] Run source discovery only when due, and allow it to register sources or quarantine candidates only.
- [ ] Reconcile verified adapter output into jobs.
- [ ] Keep provider diagnostics and credit caps.
- [ ] Run focused source tests and existing regression assertions.
- [ ] Commit orchestrator replacement with `[skip ci]`.

### Task 7: Add APAC markets and crawler health to dashboard

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/app-source.test.mjs`

**Interfaces:**
- Consumes markets, latest run metrics, source health and lifecycle fields.

- [ ] Add failing UI source assertions for market controls, verified state, null-date wording, source health, adapter classes and quarantine metrics.
- [ ] Replace the single-country editor with toggles for the six initial markets.
- [ ] Display healthy, due and failing source counts plus provider/generic-source breakdown.
- [ ] Display `Date unavailable` for null posting dates while keeping first-seen separate.
- [ ] Keep manually managed jobs visible and default new Discovered results to trusted verified-open records.
- [ ] Run source assertions and production build when dependencies are available.
- [ ] Commit dashboard integration with `[skip ci]`.

### Task 8: Validate and deploy schema to Brian Job Command Center

**Files:**
- Modify only for evidence-backed fixes.

- [ ] Re-check current Supabase changelog and Cron/Edge Function documentation.
- [ ] Apply the additive migration only to Supabase project `Brian Job Command Center`.
- [ ] Run security and performance advisors.
- [ ] Inspect RLS, grants, leasing function, source tables and Cron state.
- [ ] Confirm existing applications, documents, provider keys and manual pipeline states are unchanged.

### Task 9: Deploy function and execute production dry run

- [ ] Deploy the source-first Edge Function with the existing JWT gateway setting.
- [ ] Invoke `dry-run` and inspect source attempts, trust, identities, dates, markets, generic fallback classification and runtime bounds.
- [ ] Add a regression test for every defect found before fixing it.
- [ ] Re-deploy until dry-run evidence is clean.
- [ ] Confirm dry-run does not mutate the visible job queue.

### Task 10: Cut over and verify production

- [ ] Enable source-first writes and run one controlled manual scan.
- [ ] Quarantine suspicious untouched Discovered records without changing Applied or later pipeline records.
- [ ] Verify newly inserted jobs are trusted, verified open, correctly identified and honestly dated.
- [ ] Verify an unknown legitimate employer source can be registered and ingested through a generic adapter.
- [ ] Verify the scheduled Cron reaches the website scanner without ChatGPT.
- [ ] Run repository tests, TypeScript, lint, build, database advisors, Edge logs and live dashboard checks.
- [ ] Open and review a PR against `main` and merge only when the exact head is verified.
- [ ] Leave the legacy ChatGPT Job Match Scout untouched until the independent production scanner is proven and the user explicitly authorizes automation cleanup.
