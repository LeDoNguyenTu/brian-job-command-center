import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeDiscoverySource } from '../supabase/functions/discover-jobs/pipeline/source-discovery.ts';

test('search hit produces a source proposal rather than a job record', () => {
  const proposal = proposeDiscoverySource({
    url: 'https://careers.example.com/openings',
    title: 'Example Careers - Software Engineer',
    snippet: 'Join Example in Singapore',
    verifiedEmployerHosts: ['example.com'],
    html: '<script type="application/ld+json">{"@type":"JobPosting"}</script>',
  });
  assert.equal(proposal.kind, 'source');
  assert.equal('job' in proposal, false);
  assert.equal(proposal.source.adapter, 'jsonld');
});

test('unknown verified employer source can be registered with generic adapter', () => {
  const proposal = proposeDiscoverySource({
    url: 'https://jobs.example.com/openings',
    title: 'Careers at Example',
    snippet: 'Open roles',
    verifiedEmployerHosts: ['example.com'],
    html: '<html><a href="/openings/dev">Developer</a></html>',
  });
  assert.equal(proposal.kind, 'source');
  assert.equal(proposal.source.provider, 'custom');
  assert.equal(proposal.source.adapter, 'generic_employer_html');
  assert.equal(proposal.source.trustLevel, 'official');
});

test('untrusted mirror is quarantined', () => {
  const proposal = proposeDiscoverySource({
    url: 'https://example.github.io/jobs/acme',
    title: 'Acme jobs',
    snippet: 'Software engineer',
  });
  assert.equal(proposal.kind, 'quarantine');
  assert.match(proposal.reason, /free-hosting|ownership|untrusted/i);
});

test('known public job board is a verified-board proposal, not an official source', () => {
  const proposal = proposeDiscoverySource({
    url: 'https://sg.indeed.com/viewjob?jk=ABC123',
    title: 'Software Engineer - Example',
    snippet: 'Singapore',
  });
  assert.equal(proposal.kind, 'source');
  assert.equal(proposal.source.sourceClass, 'verified_board');
  assert.equal(proposal.source.trustLevel, 'verified_board');
});
