import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = new URL("../supabase/migrations/", import.meta.url);

const loadMigration = () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith("_apac_source_first_discovery.sql"));
  assert.equal(names.length, 1, "expected exactly one APAC source-first discovery migration");
  return readFileSync(join(migrationsDir.pathname, names[0]), "utf8");
};

const loadRuntimeBoundMigration = () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith("_bound_discovery_runtime.sql"));
  assert.equal(names.length, 1, "expected exactly one discovery runtime-bound migration");
  return readFileSync(join(migrationsDir.pathname, names[0]), "utf8");
};

test("creates registry, run and quarantine tables with RLS", () => {
  const sql = loadMigration();
  for (const table of ["discovery_sources", "discovery_runs", "discovery_quarantine"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
});

test("adds job lifecycle and APAC market fields additively", () => {
  const sql = loadMigration();
  for (const column of ["source_id", "provider_job_id", "canonical_url", "posted_at", "first_seen_at", "last_verified_at", "availability_status", "availability_evidence", "source_trust", "source_class", "market_code", "missing_from_source_count"]) {
    assert.match(sql, new RegExp(`add column if not exists ${column}`, "i"));
  }
  assert.match(sql, /add column if not exists discovery_markets text\[\]/i);
});

test("adds bounded service-only source leasing", () => {
  const sql = loadMigration();
  assert.match(sql, /create or replace function public\.lease_discovery_sources/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /least\(greatest\(p_limit, 1\), 50\)/i);
  assert.match(sql, /revoke all on function public\.lease_discovery_sources\(integer, integer\) from public/i);
  assert.match(sql, /grant execute on function public\.lease_discovery_sources\(integer, integer\) to service_role/i);
});

test("reconciles one Vault-backed cron runner", () => {
  const sql = loadMigration();
  assert.match(sql, /brian-job-discovery-runner/i);
  assert.match(sql, /vault\.decrypted_secrets/i);
  assert.match(sql, /job_discovery_cron_secret/i);
  assert.match(sql, /x-cron-secret/i);
});

test("reschedules the bounded source runner to every minute", () => {
  const sql = loadRuntimeBoundMigration();
  assert.match(sql, /brian-job-discovery-runner/i);
  assert.match(sql, /'\* \* \* \* \*'/);
  assert.match(sql, /vault\.decrypted_secrets/i);
  assert.match(sql, /job_discovery_cron_secret/i);
  assert.match(sql, /x-cron-secret/i);
});

test("creates provider identity and due-source indexes", () => {
  const sql = loadMigration();
  assert.match(sql, /create unique index if not exists jobs_source_provider_job_id_uidx/i);
  assert.match(sql, /create index if not exists discovery_sources_due_idx/i);
});