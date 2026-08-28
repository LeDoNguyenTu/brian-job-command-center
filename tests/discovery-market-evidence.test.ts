import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedJob } from '../supabase/functions/discover-jobs/adapters/common.ts';

const source = {
  id: 'source-global',
  company: 'GlobalCo',
  displayName: 'GlobalCo',
  canonicalUrl: 'https://job-boards.greenhouse.io/globalco',
  employerHost: 'globalco.com',
  sourceClass: 'direct_structured',
  provider: 'greenhouse',
  adapter: 'greenhouse',
  marketCodes: ['SG'],
  trustLevel: 'official',
  adapterConfig: {},
};

test('explicit non-APAC location never inherits the source market', () => {
  const job = normalizedJob(source, {
    providerJobId: 'us-1',
    url: 'https://job-boards.greenhouse.io/globalco/jobs/us-1',
    title: 'Software Engineer',
    locations: ['San Francisco'],
    employmentType: 'Full-time',
    descriptionText: 'Build software.',
    availabilityEvidence: 'live feed',
  });
  assert.deepEqual(job.countryCodes, []);
});

test('explicit Singapore location resolves to Singapore', () => {
  const job = normalizedJob(source, {
    providerJobId: 'sg-1',
    url: 'https://job-boards.greenhouse.io/globalco/jobs/sg-1',
    title: 'Software Engineer',
    locations: ['Singapore'],
    employmentType: 'Full-time',
    descriptionText: 'Build software.',
    availabilityEvidence: 'live feed',
  });
  assert.deepEqual(job.countryCodes, ['SG']);
});
