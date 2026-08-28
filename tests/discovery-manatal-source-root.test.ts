import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeDiscoverySourceRoot, proposeDiscoverySource } from '../supabase/functions/discover-jobs/pipeline/source-discovery.ts';

test('Manatal advanced and legacy URLs collapse to the public tenant career root', () => {
  const advanced = canonicalizeDiscoverySourceRoot('https://fpt-asia-pacific-pte-ltd.careers-page.com/jobs/1234');
  const legacy = canonicalizeDiscoverySourceRoot('https://www.careers-page.com/fpt-asia-pacific-pte-ltd/job/7XWW3WWX/apply');
  assert.equal(advanced, 'https://www.careers-page.com/fpt-asia-pacific-pte-ltd');
  assert.equal(legacy, advanced);
});

test('Manatal legacy URLs derive the employer from the tenant path', () => {
  const proposal = proposeDiscoverySource({
    url: 'https://www.careers-page.com/fpt-asia-pacific-pte-ltd/job/7XWW3WWX/apply',
    title: 'M07 - UX Researcher & Service Designer',
    snippet: 'Singapore',
  });
  assert.equal(proposal.kind, 'source');
  assert.equal(proposal.source.provider, 'manatal');
  assert.equal(proposal.source.company, 'Fpt Asia Pacific Pte Ltd');
  assert.equal(proposal.source.canonicalUrl, 'https://www.careers-page.com/fpt-asia-pacific-pte-ltd');
});
