import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entrypoint = readFileSync(new URL('../supabase/functions/discover-jobs/index.ts', import.meta.url), 'utf8');
const orchestrator = readFileSync(new URL('../supabase/functions/discover-jobs/orchestrator.ts', import.meta.url), 'utf8');
const source = `${entrypoint}\n${orchestrator}`;

test('entrypoint stays small and delegates to the orchestrator', () => {
  assert.match(entrypoint, /handleDiscoveryRequest/);
  assert.ok(entrypoint.split('\n').length <= 8);
});

test('orchestrator retains scheduled secret and admin authorization', () => {
  assert.match(source, /read_job_discovery_cron_secret_for_service/);
  assert.match(source, /auth\.getUser\(token\)/);
  assert.match(source, /rpc\(['"]is_current_admin['"]\)/);
});

test('dry-run reads due sources without leasing or mutating source registry', () => {
  assert.match(source, /plan\.dryRun[\s\S]{0,1800}from\(['"]discovery_sources['"]\)[\s\S]{0,900}next_crawl_at/);
  assert.match(source, /plan\.dryRun[\s\S]{0,2600}lease_discovery_sources/);
  assert.doesNotMatch(source, /const \{ data: leased[\s\S]{0,250}= await service\.rpc\(['"]lease_discovery_sources['"]/);
});

test('source discovery never turns raw web search hits directly into jobs', () => {
  const start = source.indexOf('async function discoverSources');
  const end = source.indexOf('async function authorize', start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(block, /from\(['"]jobs['"]\)/);
  assert.match(block, /from\(['"]discovery_sources['"]\)/);
  assert.match(block, /from\(['"]discovery_quarantine['"]\)/);
});

test('source provider failover continues until a trusted source is learned', () => {
  assert.match(source, /let providerLearned = 0/);
  assert.match(source, /if \(providerLearned > 0\) break/);
  assert.doesNotMatch(source, /if \(providerHits > 0\) break/);
});

test('unknown employer sources require structured ownership evidence rather than self-verification', () => {
  assert.match(source, /hiringOrganization/);
  assert.match(source, /verifiedEmployerHosts/);
  assert.doesNotMatch(source, /hasStrongEmployerEvidence[\s\S]{0,300}verifiedEmployerHosts\s*=\s*\[new URL\(root\)\.hostname/);
});

test('existing lifecycle data includes posted date and refresh upgrades learned identity', () => {
  assert.match(source, /select\(['"][^'"]*posted_at[^'"]*['"]\)/);
  assert.match(source, /provider_job_id:\s*refresh\.providerJobId/);
  assert.match(source, /canonical_url:\s*refresh\.canonicalUrl/);
});

test('job insertion counts only actual inserted rows', () => {
  assert.doesNotMatch(source, /ignoreDuplicates:\s*true/);
  assert.match(source, /from\(['"]jobs['"]\)\.insert\(/);
  assert.match(source, /select\(['"]id['"]\)/);
});

test('discovery implementation is independent of OpenAI and ChatGPT', () => {
  assert.doesNotMatch(source, /openai/i);
  assert.doesNotMatch(source, /chatgpt/i);
});
