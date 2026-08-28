import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260828124500_source_first_feed_cutover.sql", import.meta.url), "utf8").catch(() => "");

test("source-first feed uses employer posted date and blocks untouched legacy web discoveries", () => {
  assert.match(migration, /source_id is not null/i);
  assert.match(migration, /new\.date_found := new\.posted_at::date/i);
  assert.match(migration, /before insert or update of posted_at, source_id/i);
  assert.match(migration, /pipeline = 'Blocked'/i);
  assert.match(migration, /pipeline = 'Discovered'/i);
  assert.match(migration, /source_id is null/i);
  assert.match(migration, /saved is not true/i);
  assert.match(migration, /approved_to_apply is not true/i);
  assert.match(migration, /web discovery/i);
  assert.match(migration, /Legacy unverified discovery/i);
});
