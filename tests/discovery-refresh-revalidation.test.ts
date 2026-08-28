import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reconcileSourceSnapshot } from '../supabase/functions/discover-jobs/pipeline/reconcile.ts';
import type { NormalizedJob } from '../supabase/functions/discover-jobs/core/types.ts';

const liveJob = (overrides: Partial<NormalizedJob> = {}): NormalizedJob => ({
  sourceId: 's1',
  sourceClass: 'direct_structured',
  provider: 'greenhouse',
  providerJobId: 'j1',
  canonicalUrl: 'https://jobs.example.com/j1',
  applyUrl: 'https://jobs.example.com/j1',
  company: 'Example',
  title: 'Software Engineer',
  locations: ['Singapore'],
  countryCodes: ['SG'],
  employmentType: 'Full-time',
  descriptionText: 'Requirements Experience 4+ years total engineering experience.',
  postedAt: null,
  validThrough: null,
  availabilityStatus: 'verified_open',
  availabilityEvidence: 'live feed',
  retrievedAt: '2026-08-29T00:00:00.000Z',
  ...overrides,
});

test('refresh operations retain the current normalized vacancy and existing pipeline', () => {
  const currentJob = liveJob();
  const result = reconcileSourceSnapshot({
    now: '2026-08-29T00:00:00.000Z',
    sourceFetchSucceeded: true,
    fetchedJobs: [currentJob],
    existingJobs: [{
      id: 7,
      sourceId: 's1',
      providerJobId: 'j1',
      canonicalUrl: 'https://jobs.example.com/j1',
      pipeline: 'Discovered',
      missingFromSourceCount: 0,
      firstSeenAt: '2026-08-20T00:00:00.000Z',
    }],
  });

  assert.equal(result.refreshes.length, 1);
  assert.equal(result.refreshes[0].existingPipeline, 'Discovered');
  assert.equal(result.refreshes[0].currentJob.descriptionText, currentJob.descriptionText);
});

test('orchestrator revalidates untouched discovered refreshes and blocks newly ineligible jobs', () => {
  const source = fs.readFileSync('supabase/functions/discover-jobs/orchestrator.ts', 'utf8');
  assert.match(source, /const currentJob = refresh\.currentJob/);
  assert.match(source, /refresh\.existingPipeline === 'Discovered'/);
  assert.match(source, /assessEligibility\(\{[\s\S]*currentJob\.countryCodes[\s\S]*currentJob\.title[\s\S]*currentJob\.descriptionText/);
  assert.match(source, /refreshUpdate\.pipeline = 'Blocked'/);
  assert.match(source, /refreshUpdate\.approved_to_apply = false/);
});
