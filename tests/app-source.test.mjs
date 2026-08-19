import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const supabaseSource = await readFile(new URL("../lib/supabase.ts", import.meta.url), "utf8");
const globalStyles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

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
  assert.match(pageSource, /Supabase is the live source of truth/i);
  assert.doesNotMatch(pageSource, /Student(?:'|&apos;)s Pass/i);
  assert.doesNotMatch(pageSource, /Notion is the live source of truth/i);
});

test("limits the job list and provides date sorting", () => {
  assert.match(pageSource, /const JOBS_PER_PAGE = 10/);
  assert.match(pageSource, /filteredJobs\.slice\(0, visibleJobCount\)/);
  assert.match(pageSource, /Sort by date/);
  assert.match(pageSource, /Load more jobs/);
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
});
