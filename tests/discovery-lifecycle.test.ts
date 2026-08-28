import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSourceSnapshot, planDiscoveryRun } from '../supabase/functions/discover-jobs/pipeline/reconcile.ts';
import type { NormalizedJob } from '../supabase/functions/discover-jobs/core/types.ts';

const job = (overrides: Partial<NormalizedJob> = {}): NormalizedJob => ({
  sourceId: 's1', sourceClass: 'direct_structured', provider: 'greenhouse', providerJobId: 'j1',
  canonicalUrl: 'https://jobs.example.com/j1', applyUrl: 'https://jobs.example.com/j1', company: 'Example',
  title: 'Software Engineer', locations: ['Singapore'], countryCodes: ['SG'], employmentType: 'Full-time',
  descriptionText: 'Build things', postedAt: null, validThrough: null, availabilityStatus: 'verified_open',
  availabilityEvidence: 'live feed', retrievedAt: '2026-08-28T00:00:00.000Z', ...overrides,
});

test('new verified job inserts with first seen and does not invent posted date', () => {
  const result = reconcileSourceSnapshot({ now: '2026-08-28T00:00:00.000Z', sourceFetchSucceeded: true, fetchedJobs: [job()], existingJobs: [] });
  assert.equal(result.inserts.length, 1);
  assert.equal(result.inserts[0].postedAt, null);
  assert.equal(result.inserts[0].firstSeenAt, '2026-08-28T00:00:00.000Z');
  assert.equal(result.inserts[0].lastSeenAt, '2026-08-28T00:00:00.000Z');
});

test('duplicate refresh resets missing count and refreshes availability evidence', () => {
  const result = reconcileSourceSnapshot({
    now: '2026-08-28T00:00:00.000Z', sourceFetchSucceeded: true, fetchedJobs: [job({ availabilityEvidence: 'fresh live feed' })],
    existingJobs: [{ id: 7, sourceId: 's1', providerJobId: 'j1', canonicalUrl: 'https://jobs.example.com/j1', pipeline: 'Discovered', missingFromSourceCount: 1, firstSeenAt: '2026-08-20T00:00:00.000Z' }],
  });
  assert.equal(result.refreshes.length, 1);
  assert.equal(result.refreshes[0].missingFromSourceCount, 0);
  assert.equal(result.refreshes[0].availabilityEvidence, 'fresh live feed');
});

test('refresh with unknown posted date preserves an existing known date', () => {
  const result = reconcileSourceSnapshot({
    now: '2026-08-28T00:00:00.000Z', sourceFetchSucceeded: true, fetchedJobs: [job({ postedAt: null })],
    existingJobs: [{ id: 7, sourceId: 's1', providerJobId: 'j1', canonicalUrl: 'https://jobs.example.com/j1', pipeline: 'Discovered', missingFromSourceCount: 0, firstSeenAt: '2026-08-20T00:00:00.000Z', postedAt: '2026-08-25T00:00:00.000Z' }],
  });
  assert.equal(result.refreshes[0].postedAt, '2026-08-25T00:00:00.000Z');
});

test('canonical URL fallback upgrades an earlier URL-only record instead of duplicating it', () => {
  const result = reconcileSourceSnapshot({
    now: '2026-08-28T00:00:00.000Z', sourceFetchSucceeded: true,
    fetchedJobs: [job({ providerJobId: 'learned-id', canonicalUrl: 'https://jobs.example.com/j1' })],
    existingJobs: [{ id: 7, sourceId: 's1', providerJobId: null, canonicalUrl: 'https://jobs.example.com/j1', pipeline: 'Discovered', missingFromSourceCount: 0, firstSeenAt: '2026-08-20T00:00:00.000Z' }],
  });
  assert.equal(result.inserts.length, 0);
  assert.equal(result.refreshes.length, 1);
  assert.equal(result.refreshes[0].providerJobId, 'learned-id');
});

test('explicit closed evidence closes an untouched discovered job immediately', () => {
  const result = reconcileSourceSnapshot({
    now: '2026-08-28T00:00:00.000Z', sourceFetchSucceeded: true,
    fetchedJobs: [job({ availabilityStatus: 'closed', availabilityEvidence: 'Official page says position filled' })],
    existingJobs: [{ id: 1, sourceId: 's1', providerJobId: 'j1', canonicalUrl: 'https://jobs.example.com/j1', pipeline: 'Discovered', missingFromSourceCount: 0, firstSeenAt: '2026-08-20T00:00:00.000Z' }],
  });
  assert.deepEqual(result.closes, [{ id: 1, availabilityStatus: 'closed', availabilityEvidence: 'Official page says position filled' }]);
  assert.equal(result.missingUpdates.length, 0);
});

test('explicit closed evidence does not close a manually managed applied job', () => {
  const result = reconcileSourceSnapshot({
    now: '2026-08-28T00:00:00.000Z', sourceFetchSucceeded: true,
    fetchedJobs: [job({ availabilityStatus: 'closed', availabilityEvidence: 'Official page says position filled' })],
    existingJobs: [{ id: 2, sourceId: 's1', providerJobId: 'j1', canonicalUrl: 'https://jobs.example.com/j1', pipeline: 'Applied', missingFromSourceCount: 0, firstSeenAt: '2026-08-20T00:00:00.000Z' }],
  });
  assert.equal(result.closes.length, 0);
  assert.equal(result.missingUpdates.length, 0);
});

test('two successful omissions close only untouched Discovered jobs', () => {
  const result = reconcileSourceSnapshot({
    now: '2026-08-28T00:00:00.000Z', sourceFetchSucceeded: true, fetchedJobs: [],
    existingJobs: [
      { id: 1, sourceId: 's1', providerJobId: 'a', canonicalUrl: 'https://x/a', pipeline: 'Discovered', missingFromSourceCount: 1, firstSeenAt: '2026-08-20T00:00:00.000Z' },
      { id: 2, sourceId: 's1', providerJobId: 'b', canonicalUrl: 'https://x/b', pipeline: 'Applied', missingFromSourceCount: 1, firstSeenAt: '2026-08-20T00:00:00.000Z' },
    ],
  });
  assert.deepEqual(result.closes.map((x) => x.id), [1]);
  assert.equal(result.missingUpdates.find((x) => x.id === 2)?.missingFromSourceCount, 2);
});

test('failed source never ages or closes jobs', () => {
  const result = reconcileSourceSnapshot({
    now: '2026-08-28T00:00:00.000Z', sourceFetchSucceeded: false, fetchedJobs: [],
    existingJobs: [{ id: 1, sourceId: 's1', providerJobId: 'a', canonicalUrl: 'https://x/a', pipeline: 'Discovered', missingFromSourceCount: 99, firstSeenAt: '2026-08-20T00:00:00.000Z' }],
  });
  assert.equal(result.closes.length, 0);
  assert.equal(result.missingUpdates.length, 0);
});

test('run planning keeps every Edge invocation resource-bounded', () => {
  assert.deepEqual(planDiscoveryRun('scheduled'), { sourceLimit: 10, runSourceDiscovery: false, dryRun: false });
  assert.deepEqual(planDiscoveryRun('manual'), { sourceLimit: 30, runSourceDiscovery: true, dryRun: false });
  assert.deepEqual(planDiscoveryRun('dry-run'), { sourceLimit: 20, runSourceDiscovery: true, dryRun: true });
  assert.deepEqual(planDiscoveryRun('diagnostic'), { sourceLimit: 10, runSourceDiscovery: false, dryRun: true });
});
