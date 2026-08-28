import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entrypoint = readFileSync(new URL('../supabase/functions/discover-jobs/index.ts', import.meta.url), 'utf8');
const orchestrator = readFileSync(new URL('../supabase/functions/discover-jobs/orchestrator.ts', import.meta.url), 'utf8');
const source = `${entrypoint}\n${orchestrator}`;

test('keeps the Edge entrypoint small and delegates orchestration', () => {
  assert.match(entrypoint, /handleDiscoveryRequest/);
  assert.match(entrypoint, /Deno\.serve\(handleDiscoveryRequest\)/);
  assert.ok(entrypoint.length < 1000);
});

test('retains cron secret and signed-in admin authorization', () => {
  assert.match(orchestrator, /read_job_discovery_cron_secret_for_service/);
  assert.match(orchestrator, /x-cron-secret/);
  assert.match(orchestrator, /auth\.getUser/);
  assert.match(orchestrator, /is_current_admin/);
});

test('uses bounded source leases and source adapters', () => {
  assert.match(orchestrator, /lease_discovery_sources/);
  assert.match(orchestrator, /fetchSourceJobs/);
  assert.match(orchestrator, /planDiscoveryRun/);
});

test('supports dry-run and persists run metrics', () => {
  assert.match(orchestrator, /dry-run/);
  assert.match(orchestrator, /discovery_runs/);
  assert.match(orchestrator, /dryRun/);
});

test('search discovery only proposes sources or quarantine records', () => {
  assert.match(orchestrator, /proposeDiscoverySource/);
  assert.doesNotMatch(orchestrator, /allCandidates\.push\(\.\.\.extractedCandidates\)/);
  assert.doesNotMatch(orchestrator, /webCandidates.*upsert\(.*jobs/s);
});

test('discovery has no OpenAI or ChatGPT runtime dependency', () => {
  assert.doesNotMatch(source, /openai\.com|api\.openai|chatgpt/i);
});
