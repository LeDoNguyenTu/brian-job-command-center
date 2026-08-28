import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../supabase/functions/discover-jobs/index.ts', import.meta.url), 'utf8');

test('retains cron secret and signed-in admin authorization', () => {
  assert.match(source, /read_job_discovery_cron_secret_for_service/);
  assert.match(source, /x-cron-secret/);
  assert.match(source, /auth\.getUser/);
  assert.match(source, /is_current_admin/);
});

test('uses bounded source leases and source adapters', () => {
  assert.match(source, /lease_discovery_sources/);
  assert.match(source, /fetchSourceJobs/);
  assert.match(source, /planDiscoveryRun/);
});

test('supports dry-run and persists run metrics', () => {
  assert.match(source, /dry-run/);
  assert.match(source, /discovery_runs/);
  assert.match(source, /dryRun/);
});

test('search discovery only proposes sources or quarantine records', () => {
  assert.match(source, /proposeDiscoverySource/);
  assert.doesNotMatch(source, /allCandidates\.push\(\.\.\.extractedCandidates\)/);
  assert.doesNotMatch(source, /webCandidates.*upsert\(.*jobs/s);
});

test('discovery has no OpenAI or ChatGPT runtime dependency', () => {
  assert.doesNotMatch(source, /openai\.com|api\.openai|chatgpt/i);
});
