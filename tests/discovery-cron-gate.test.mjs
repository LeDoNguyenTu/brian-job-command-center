import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260828125500_skip_empty_discovery_cron.sql", import.meta.url), "utf8").catch(() => "");

test("cron invokes discovery only for due source work or the daily source-discovery window", () => {
  assert.match(migration, /exists\s*\(\s*select 1\s*from public\.discovery_sources/is);
  assert.match(migration, /next_crawl_at <= now\(\)/i);
  assert.match(migration, /lease_expires_at is null/i);
  assert.match(migration, /last_scheduled_discovery_date is distinct from/i);
  assert.match(migration, /discovery_timezone/i);
  assert.match(migration, /discovery_time/i);
  assert.match(migration, /discovery_enabled/i);
  assert.match(migration, /'\* \* \* \* \*'/);
});
