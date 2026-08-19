import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const supabaseSource = await readFile(new URL("../lib/supabase.ts", import.meta.url), "utf8");
const globalStyles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const discoverySource = await readFile(new URL("../supabase/functions/discover-jobs/index.ts", import.meta.url), "utf8");
const sourceMigration = await readFile(new URL("../supabase/migrations/202608190011_expand_singapore_discovery_sources.sql", import.meta.url), "utf8");

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
});

test("uses Brian's logo, browser-time greeting, clock, and personal footer", () => {
  assert.match(pageSource, /src="\/brian-logo\.png"/);
  assert.match(layoutSource, /icon: "\/brian-logo\.png"/);
  assert.match(pageSource, /setInterval\(\(\) => setCurrentDate\(new Date\(\)\), 1_000\)/);
  assert.match(pageSource, /Good afternoon/);
  assert.match(pageSource, /browserTimeZone/);
  assert.match(pageSource, /Proudly made by Le Do Nguyen Tu/);
  assert.match(globalStyles, /\.browser-clock\{/);
});

test("expands supported Singapore company career sources efficiently", () => {
  assert.match(sourceMigration, /job-boards\.greenhouse\.io\/cloudflare/);
  assert.match(sourceMigration, /job-boards\.greenhouse\.io\/reolink/);
  assert.match(sourceMigration, /jobs\.lever\.co\/sonarsource/);
  assert.match(sourceMigration, /jobs\.lever\.co\/ninjavan/);
  assert.match(discoverySource, /Promise\.all\(parsedSources\.map/);
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
