import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const supabaseSource = await readFile(new URL("../lib/supabase.ts", import.meta.url), "utf8");

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
