import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRecruitmentSource } from '../supabase/functions/discover-jobs/core/source-classifier.ts';
import { fetchManatal } from '../supabase/functions/discover-jobs/adapters/manatal.ts';
import type { DiscoverySourceRecord } from '../supabase/functions/discover-jobs/core/types.ts';

const source: DiscoverySourceRecord = {
  id: 'manatal-fpt',
  company: 'Fpt Asia Pacific Pte Ltd',
  displayName: 'Fpt Asia Pacific Pte Ltd',
  canonicalUrl: 'https://www.careers-page.com/fpt-asia-pacific-pte-ltd',
  employerHost: 'www.careers-page.com',
  sourceClass: 'direct_structured',
  provider: 'manatal',
  adapter: 'manatal',
  marketCodes: ['SG'],
  trustLevel: 'official',
  adapterConfig: {},
};

test('Manatal is fingerprinted to its structured public adapter', () => {
  const result = classifyRecruitmentSource({ url: source.canonicalUrl });
  assert.equal(result.provider, 'manatal');
  assert.equal(result.adapter, 'manatal');
  assert.equal(result.sourceClass, 'direct_structured');
});

test('Manatal adapter pages the public Career Page API and normalizes Singapore jobs', async () => {
  const requests: string[] = [];
  const fetcher = async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    if (!url.includes('/open/v3/career-page/fpt-asia-pacific-pte-ltd/jobs/')) {
      return new Response('not found', { status: 404 });
    }
    return new Response(JSON.stringify({
      count: 1,
      next: null,
      previous: null,
      results: [{
        id: 4291181,
        hash: '7X54RW95',
        position_name: 'Junior Software Engineer',
        description: '<p>Build APIs and cloud services.</p>',
        country: 'Singapore',
        state: 'Singapore',
        city: 'Singapore',
        location_display: 'Singapore',
        contract_details: 'full_time',
        created_at: '2026-08-20T00:00:00Z',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await fetchManatal(source, fetcher);
  assert.equal(result.status, 'success');
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].providerJobId, '4291181');
  assert.equal(result.jobs[0].company, 'Fpt Asia Pacific Pte Ltd');
  assert.equal(result.jobs[0].title, 'Junior Software Engineer');
  assert.deepEqual(result.jobs[0].countryCodes, ['SG']);
  assert.equal(result.jobs[0].employmentType, 'full time');
  assert.equal(result.jobs[0].canonicalUrl, 'https://www.careers-page.com/fpt-asia-pacific-pte-ltd/job/7X54RW95');
  assert.match(requests[0], /country__icontains=Singapore/);
  assert.match(requests[0], /page_size=100/);
});
