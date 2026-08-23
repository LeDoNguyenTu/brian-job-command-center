import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const supabaseSource = await readFile(new URL("../lib/supabase.ts", import.meta.url), "utf8");
const globalStyles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const nextConfigSource = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
const proxySource = await readFile(new URL("../proxy.ts", import.meta.url), "utf8");
const discoverySource = await readFile(new URL("../supabase/functions/discover-jobs/index.ts", import.meta.url), "utf8");
const sourceMigration = await readFile(new URL("../supabase/migrations/202608190011_expand_singapore_discovery_sources.sql", import.meta.url), "utf8");
const webDiscoveryMigration = await readFile(new URL("../supabase/migrations/20260822205618_broaden_job_discovery_and_decisions.sql", import.meta.url), "utf8");
const tavilyMigration = await readFile(new URL("../supabase/migrations/20260823004500_configurable_tavily_job_discovery.sql", import.meta.url), "utf8");
const providerPoolMigration = await readFile(new URL("../supabase/migrations/20260823020000_multi_provider_search_failover.sql", import.meta.url), "utf8");
const resumeCriteriaMigration = await readFile(new URL("../supabase/migrations/20260823030000_resume_library_and_scout_criteria.sql", import.meta.url), "utf8");
const sourceLearningMigration = await readFile(new URL("../supabase/migrations/20260823040000_learn_strong_web_sources.sql", import.meta.url), "utf8");
const resumeCriteriaRoute = await readFile(new URL("../app/api/resume-criteria/route.ts", import.meta.url), "utf8");

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
  const [red, green, blue] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("keeps the private sign-in and Supabase dashboard safeguards", () => {
  assert.match(pageSource, /Welcome back\./i);
  assert.match(pageSource, /Cloudflare security check/i);
  assert.match(pageSource, /Supabase protected/i);
  assert.doesNotMatch(pageSource, /Supabase is the live source of truth/i);
  assert.doesNotMatch(pageSource, /Student(?:'|&apos;)s Pass/i);
  assert.doesNotMatch(pageSource, /Notion is the live source of truth/i);
});

test("limits the job list and provides date sorting", () => {
  assert.match(pageSource, /const JOBS_PER_PAGE = 10/);
  assert.match(pageSource, /filteredJobs\.slice\(0, visibleJobCount\)/);
  assert.match(pageSource, /Sort by date/);
  assert.match(pageSource, /All feed dates/);
  assert.match(pageSource, /second\.score - first\.score/);
  assert.match(pageSource, /highest match first/);
  assert.match(pageSource, /Load more jobs/);
  assert.match(globalStyles, /\.pipeline-tools\{width:100%;grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(globalStyles, /\.date-sort select\{width:100%;height:42px/);
  assert.match(globalStyles, /\.filter-tabs\{display:grid;width:100%;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
});

test("keeps job titles clear and provides accessible score and text controls", () => {
  assert.match(pageSource, /className="score-ring-progress"/);
  assert.match(pageSource, /strokeDasharray={`\${Math\.max/);
  assert.match(globalStyles, /\.score-ring-value\{stroke:var\(--score-color\)/);
  assert.match(globalStyles, /\.score-ring\{[^}]*bottom:18px/);
  assert.match(globalStyles, /\.match-pill\.review\{[^}]*var\(--purple-bright\)/);
  assert.match(globalStyles, /\.date-sort:after/);
  assert.match(pageSource, /Dashboard text size/);
  assert.match(pageSource, /TEXT_SIZE_KEY/);
  assert.match(pageSource, /text-size-\$\{textSize\}/);
  assert.match(globalStyles, /\.app-shell select option\{background:#151824;color:#f5f7ff\}/);
  assert.match(globalStyles, /\.app-shell\.light select option\{background:#fff;color:#1b1d29\}/);
  assert.match(globalStyles, /Responsive containment shared by every dashboard section and modal/);
  assert.match(globalStyles, /\.app-shell :where\(input,select,textarea,button\)\{max-width:100%\}/);
  assert.match(globalStyles, /\.welcome-section h1\{font-size:clamp\(30px,9vw,34px\)\}/);
  assert.match(globalStyles, /\.scout-actions,\.salary-actions,\.modal-actions,\.document-actions,\.provider-actions\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test("opens a job from the full card and optically centers dashboard icons", () => {
  assert.match(pageSource, /aria-label={`Review details for \${job\.role} at \${job\.company}`}/);
  assert.match(pageSource, /event\.target as HTMLElement\)\.closest\("button, a, input, select, textarea"\)/);
  assert.match(pageSource, /event\.key !== "Enter" && event\.key !== " "/);
  assert.match(pageSource, /function DashboardIcon/);
  assert.match(pageSource, /<DashboardIcon name="clock"/);
  assert.match(pageSource, /<DashboardIcon name="queue"/);
  assert.match(pageSource, /<DashboardIcon name="sparkles"/);
  assert.match(globalStyles, /\.dashboard-icon\{display:block/);
  assert.match(globalStyles, /\.job-card:focus-visible/);
});

test("keeps Cloudflare verification visible on narrow screens", () => {
  assert.match(pageSource, /container\.clientWidth < 300 \? "compact" : "flexible"/);
  assert.match(pageSource, /new ResizeObserver\(renderWidget\)/);
  assert.match(globalStyles, /\.turnstile-widget\{[^}]*justify-content:center/);
  assert.match(globalStyles, /@media\(max-width:420px\)\{\.auth-shell\{padding:12px\}/);
});

test("uses Brian's logo, browser-time greeting, clock, and personal footer", () => {
  assert.match(pageSource, /src="\/brian-logo\.png"/);
  assert.match(layoutSource, /icon: "\/brian-logo\.png"/);
  assert.match(pageSource, /setInterval\(\(\) => setCurrentDate\(new Date\(\)\), 1_000\)/);
  assert.match(pageSource, /Good afternoon/);
  assert.match(pageSource, /browserTimeZone/);
  assert.match(pageSource, /Proudly made by Le Do Nguyen Tu/);
  assert.match(globalStyles, /\.browser-clock\{/);
  assert.match(globalStyles, /grid-template-columns:34px minmax\(0,1fr\) 34px/);
  assert.match(globalStyles, /\.connection-status\{[^}]*white-space:nowrap/);
  assert.match(globalStyles, /input\[type="time"\]\{[^}]*min-width:0/);
});

test("expands supported Singapore company career sources efficiently", () => {
  assert.match(sourceMigration, /job-boards\.greenhouse\.io\/cloudflare/);
  assert.match(sourceMigration, /job-boards\.greenhouse\.io\/reolink/);
  assert.match(sourceMigration, /jobs\.lever\.co\/sonarsource/);
  assert.match(sourceMigration, /jobs\.lever\.co\/ninjavan/);
  assert.match(discoverySource, /Promise\.all\(parsedSources\.map/);
});

test("combines web-wide discovery with strict fresh-graduate filtering", () => {
  assert.match(discoverySource, /api\.tavily\.com\/search/);
  assert.match(discoverySource, /api\.tavily\.com\/extract/);
  assert.match(discoverySource, /api\.tavily\.com\/usage/);
  assert.match(discoverySource, /api\.exa\.ai\/search/);
  assert.match(discoverySource, /api\.firecrawl\.dev\/v2\/search/);
  assert.match(discoverySource, /api\.search\.brave\.com\/res\/v1\/web\/search/);
  assert.match(discoverySource, /return supported\.has\(code\) \? code : "ALL"/);
  assert.match(discoverySource, /serpapi\.com\/search\.json/);
  assert.match(discoverySource, /google\.serper\.dev\/search/);
  assert.match(discoverySource, /DEFAULT_PROVIDER_ORDER/);
  assert.match(discoverySource, /providerAttempts/);
  assert.match(discoverySource, /slice\(0, 10\)/);
  assert.match(discoverySource, /interleaveUniqueResults/);
  assert.match(discoverySource, /providersWithResults >= 1 && eligibleWebCandidates >= 12/);
  assert.match(discoverySource, /successfulProviders >= 3/);
  assert.match(discoverySource, /AbortSignal\.timeout\(20_000\)/);
  assert.match(discoverySource, /missingContent\.length \/ 8/);
  assert.match(discoverySource, /searchFunnel/);
  assert.match(discoverySource, /const isDue = clock\.minutes >= target/);
  assert.match(discoverySource, /Use Fetch now to run another manual scan/);
  assert.match(pageSource, /action: "manual"/);
  assert.match(pageSource, /Starting a new manual scan/);
  assert.match(discoverySource, /Workday Ashby SmartRecruiters Workable iCIMS Oracle/);
  assert.match(discoverySource, /discovery_monthly_credit_cap/);
  assert.match(discoverySource, /Safety cap reached/);
  assert.match(discoverySource, /function assessEligibility/);
  assert.match(discoverySource, /function requiredExperienceYears/);
  assert.match(discoverySource, /outside target roles/);
  assert.match(discoverySource, /discovery_max_required_years/);
  assert.match(discoverySource, /isIndividualJobResult/);
  assert.match(webDiscoveryMigration, /discovery_web_search_enabled/);
  assert.match(webDiscoveryMigration, /store_web_search_key_internal/);
  assert.match(webDiscoveryMigration, /job_web_search_key/);
  assert.match(tavilyMigration, /discovery_location/);
  assert.match(tavilyMigration, /discovery_country/);
  assert.match(tavilyMigration, /discovery_web_search_provider = 'tavily'/);
  assert.match(tavilyMigration, /tvly-/);
  assert.match(providerPoolMigration, /store_search_provider_keys/);
  assert.match(providerPoolMigration, /read_search_provider_keys_for_service/);
  assert.match(providerPoolMigration, /job_exa_search_key/);
  assert.match(providerPoolMigration, /job_firecrawl_search_key/);
  assert.match(providerPoolMigration, /job_brave_search_key/);
  assert.match(providerPoolMigration, /job_serpapi_search_key/);
  assert.match(providerPoolMigration, /job_serper_search_key/);
  assert.match(pageSource, /Target country/);
  assert.match(pageSource, /City, region, or country/);
  assert.match(pageSource, /Tavily API key/);
  assert.match(pageSource, /Exa API key/);
  assert.match(pageSource, /Firecrawl API key/);
  assert.match(pageSource, /Brave Search API key/);
  assert.match(pageSource, /SerpApi key/);
  assert.match(pageSource, /Serper API key/);
  assert.match(pageSource, /store_search_provider_keys/);
  assert.match(pageSource, /graduate junior IT support helpdesk service desk network support/);
  assert.match(resumeCriteriaRoute, /"software engineer", "software engineering intern"/);
  assert.match(resumeCriteriaRoute, /"soc analyst", "soc engineer", "security analyst"/);
  assert.match(resumeCriteriaRoute, /"security compliance", "security governance"/);
  assert.doesNotMatch(resumeCriteriaRoute, /keywords: \["software", "application", "web"/);
});

test("supports accept, applied, and reject decisions with filters", () => {
  assert.match(pageSource, /const setJobDecision = async/);
  assert.match(pageSource, /pipeline: decision/);
  assert.match(pageSource, /Decision/);
  assert.match(pageSource, /All statuses/);
  assert.match(pageSource, /✓ Accept/);
  assert.match(pageSource, /↗ Applied/);
  assert.match(pageSource, /× Reject/);
  assert.match(pageSource, /store_search_provider_keys/);
  assert.match(pageSource, /Open LinkedIn/);
  assert.match(pageSource, /Open Indeed/);
  assert.match(globalStyles, /\.decision-actions\{/);
});

test("prepares verified application answers without submitting employer forms", () => {
  assert.match(pageSource, /buildApplicationAnswers/);
  assert.match(pageSource, /Ready-to-paste answers/);
  assert.match(pageSource, /Open listing \+ copy pack/);
  assert.match(pageSource, /Visa sponsorship required/);
  assert.match(pageSource, /Check the employer sector and application date against the current MOM S Pass table/);
  assert.match(pageSource, /It never fills declarations, solves CAPTCHA, signs in, or submits an application/);
  assert.match(globalStyles, /\.application-answer-list/);
  assert.match(globalStyles, /@media\(max-width:520px\).*\.application-pack-actions\{grid-template-columns:1fr\}/s);
});

test("learns reusable direct feeds only from strong web matches", () => {
  assert.match(sourceLearningMigration, /discovery_source_learning_enabled/);
  assert.match(sourceLearningMigration, /discovery_learned_sources/);
  assert.match(discoverySource, /match\.score < 80/);
  assert.match(discoverySource, /repeatableFeed/);
  assert.match(discoverySource, /reusable direct feed/);
  assert.match(pageSource, /Learn reusable sources from strong web matches/);
  assert.match(pageSource, /direct feed added/);
  assert.match(discoverySource, /const locationText = candidate\.location\.toLowerCase\(\)/);
  assert.doesNotMatch(discoverySource, /const locationText = `\$\{candidate\.location\} \$\{candidate\.description\}`/);
});

test("keeps multiple private resume formats and requires criteria approval", () => {
  assert.match(pageSource, /resume_files\(\*\)/);
  assert.match(pageSource, /multiple accept="\.docx,\.pdf/);
  assert.match(pageSource, /A criteria proposal will be prepared for review/);
  assert.match(pageSource, /Approve new criteria/);
  assert.match(pageSource, /Keep current criteria/);
  assert.match(pageSource, /discovery_criteria_suggestion_status: "pending"/);
  assert.match(pageSource, /discovery_target_role_keywords/);
  assert.match(discoverySource, /containsConfiguredKeyword/);
  assert.match(discoverySource, /discovery_excluded_title_keywords/);
  assert.match(resumeCriteriaMigration, /create table if not exists public\.resume_files/);
  assert.match(resumeCriteriaMigration, /resume_files_admin_all/);
  assert.match(resumeCriteriaMigration, /discovery_criteria_suggestion_status/);
  assert.match(resumeCriteriaRoute, /mammoth\.extractRawText/);
  assert.match(resumeCriteriaRoute, /extractText\(new Uint8Array/);
  assert.match(resumeCriteriaRoute, /Nothing changes until you approve/);
  assert.match(globalStyles, /\.criteria-proposal-heading>span\{[^}]*align-items:center/);
  assert.match(globalStyles, /\.criteria-proposal-heading>span\{[^}]*justify-content:center/);
  assert.match(globalStyles, /\.criteria-proposal-actions button\{min-height:40px\}/);
});

test("checks provider keys without consuming search credits", () => {
  assert.match(pageSource, /const testSearchProviders = async/);
  assert.match(pageSource, /action: "diagnostic"/);
  assert.match(pageSource, /Check key status/);
  assert.match(pageSource, /Last used/);
  assert.match(pageSource, /HTTP \$\{provider\.httpStatus\}/);
  assert.match(globalStyles, /\.provider-last-used/);
  assert.match(discoverySource, /checkProviderWithoutSearch/);
  assert.match(discoverySource, /api\.tavily\.com\/usage/);
  assert.match(discoverySource, /api\.firecrawl\.dev\/v2\/team\/credit-usage/);
  assert.match(discoverySource, /serpapi\.com\/account\.json/);
  const diagnosticBranch = discoverySource.slice(
    discoverySource.indexOf('if (action === "diagnostic")'),
    discoverySource.indexOf("if (!settings.discovery_source_urls?.length"),
  );
  assert.doesNotMatch(diagnosticBranch, /searchProvider\(/);
  assert.match(discoverySource, /Math\.max\(keyUsage, accountUsage\)/);
});

test("persists the dashboard scout toggle and visibly pauses its radar", () => {
  assert.match(pageSource, /const toggleDiscoveryAutomation = async/);
  assert.match(pageSource, /discovery_enabled: nextEnabled/);
  assert.match(pageSource, /aria-pressed=\{discoveryEnabled\}/);
  assert.match(pageSource, /Pause automatic job discovery/);
  assert.match(pageSource, /Resume automatic job discovery/);
  assert.match(globalStyles, /\.scan-visual\.paused \.scan-line\{animation-play-state:paused/);
  assert.match(globalStyles, /\.scout-card\.paused\{/);
});

test("keeps a deploy-safe Supabase public configuration fallback", () => {
  assert.match(supabaseSource, /defaultSupabaseUrl/);
  assert.match(supabaseSource, /defaultSupabasePublishableKey/);
  assert.doesNotMatch(supabaseSource, /environment variables are not configured/i);
});

test("sends defensive browser security headers on every route", () => {
  assert.match(nextConfigSource, /poweredByHeader: false/);
  assert.match(proxySource, /Content-Security-Policy/);
  assert.match(proxySource, /frame-ancestors 'none'/);
  assert.match(proxySource, /'nonce-\${nonce}' 'strict-dynamic'/);
  assert.doesNotMatch(proxySource, /unsafe-inline/);
  assert.match(proxySource, /script-src-attr 'none'/);
  assert.match(proxySource, /style-src-attr 'unsafe-hashes' 'sha256-/);
  assert.match(layoutSource, /await headers\(\)/);
  assert.match(layoutSource, /data-csp-nonce/);
  assert.match(pageSource, /script\.nonce = document\.body\.dataset\.cspNonce/);
  assert.match(nextConfigSource, /X-Content-Type-Options/);
  assert.match(nextConfigSource, /X-Frame-Options/);
  assert.match(nextConfigSource, /Referrer-Policy/);
  assert.match(nextConfigSource, /Permissions-Policy/);
  assert.match(nextConfigSource, /Cross-Origin-Opener-Policy/);
  assert.match(nextConfigSource, /source: "\/:path\*"/);
});

test("keeps theme text and accent tokens at readable contrast", () => {
  const darkPanel = "#151824";
  const lightPage = "#f3f4f9";
  const darkTokens = ["#f5f7ff", "#9299ad", "#7b849a", "#bdaaff", "#55d9f2", "#70e8ad", "#ffba6b", "#ff7f8f"];
  const lightTokens = ["#1b1d29", "#606678", "#686f82", "#5e3ec2", "#006f7f", "#167548", "#965100", "#be2b40"];

  darkTokens.forEach((token) => assert.ok(contrast(token, darkPanel) >= 4.5, `${token} must remain readable in dark mode`));
  lightTokens.forEach((token) => assert.ok(contrast(token, lightPage) >= 4.5, `${token} must remain readable in light mode`));
  assert.match(globalStyles, /--control-border:#626b82/);
  assert.match(globalStyles, /--control-border:#8e94a3/);
  assert.match(globalStyles, /--primary-start:#7353db;--primary-end:#5e3cc5/);
  assert.match(globalStyles, /\.primary-button:disabled\{opacity:\.82/);
  assert.match(globalStyles, /\.secondary-button:disabled,\.passkey-button:disabled\{opacity:\.72/);
});
