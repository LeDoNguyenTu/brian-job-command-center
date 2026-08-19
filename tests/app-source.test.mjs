import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("keeps the private sign-in and Supabase dashboard safeguards", () => {
  assert.match(pageSource, /Welcome back\./i);
  assert.match(pageSource, /Cloudflare security check/i);
  assert.match(pageSource, /Supabase is the live source of truth/i);
  assert.doesNotMatch(pageSource, /Student(?:'|&apos;)s Pass/i);
  assert.doesNotMatch(pageSource, /Notion is the live source of truth/i);
});
