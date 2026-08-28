import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSourceJobs } from '../supabase/functions/discover-jobs/adapters/index.ts';

const source = (adapter: string, canonicalUrl: string, provider = adapter) => ({
  id: `source-${adapter}`,
  company: 'Acme',
  displayName: 'Acme',
  canonicalUrl,
  employerHost: 'acme.com',
  sourceClass: adapter === 'verified_board' ? 'verified_board' : (['jsonld','embedded_json','generic_employer_html'].includes(adapter) ? 'generic_employer' : 'direct_structured'),
  provider,
  adapter,
  marketCodes: ['SG'],
  trustLevel: adapter === 'verified_board' ? 'verified_board' : 'official',
  adapterConfig: {},
});

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const htmlResponse = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html' } });

test('Greenhouse adapter lists first and fetches details only for source-market jobs', async () => {
  const calls: string[] = [];
  const fetcher = async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://boards-api.greenhouse.io/v1/boards/acme/jobs') {
      return jsonResponse({ jobs: [
        { id: 42, title: 'Software Engineer', absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/42', location: { name: 'Singapore' }, updated_at: '2026-08-27T00:00:00Z' },
        { id: 99, title: 'Software Engineer', absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/99', location: { name: 'Seattle, WA' }, updated_at: '2026-08-27T00:00:00Z' },
      ] });
    }
    if (url === 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/42') {
      return jsonResponse({ id: 42, title: 'Software Engineer', absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/42', content: '<p>Build APIs</p>', location: { name: 'Singapore' }, first_published: '2026-08-20T00:00:00Z' });
    }
    throw new Error(`Unexpected Greenhouse request: ${url}`);
  };
  const result = await fetchSourceJobs(source('greenhouse', 'https://job-boards.greenhouse.io/acme'), fetcher as typeof fetch);
  assert.equal(result.status, 'success');
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].providerJobId, '42');
  assert.equal(result.jobs[0].availabilityStatus, 'verified_open');
  assert.equal(result.jobs[0].descriptionText, 'Build APIs');
  assert.equal(result.jobs[0].postedAt, '2026-08-20T00:00:00.000Z');
  assert.equal(calls.some((url) => url.includes('content=true')), false);
  assert.equal(calls.includes('https://boards-api.greenhouse.io/v1/boards/acme/jobs/99'), false);
});

test('large Greenhouse boards do not fetch descriptions for unrelated markets', async () => {
  const listings = Array.from({ length: 800 }, (_, index) => ({
    id: index + 1,
    title: 'Software Engineer',
    absolute_url: `https://job-boards.greenhouse.io/acme/jobs/${index + 1}`,
    location: { name: 'Seattle, WA' },
  }));
  listings.push({ id: 9001, title: 'Software Engineer', absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/9001', location: { name: 'Singapore' } });
  let detailRequests = 0;
  const fetcher = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://boards-api.greenhouse.io/v1/boards/acme/jobs') return jsonResponse({ jobs: listings });
    if (url === 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/9001') {
      detailRequests += 1;
      return jsonResponse({ id: 9001, title: 'Software Engineer', absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/9001', content: '<p>Build Singapore systems</p>', location: { name: 'Singapore' } });
    }
    throw new Error(`Unexpected Greenhouse detail fetch: ${url}`);
  };
  const result = await fetchSourceJobs(source('greenhouse', 'https://job-boards.greenhouse.io/acme'), fetcher as typeof fetch);
  assert.equal(result.status, 'success');
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].providerJobId, '9001');
  assert.equal(detailRequests, 1);
});

test('Lever adapter emits verified normalized jobs', async () => {
  const fetcher = async () => jsonResponse([{ id: 'lev-1', text: 'Security Analyst', hostedUrl: 'https://jobs.lever.co/acme/lev-1', descriptionPlain: 'Investigate alerts', categories: { location: 'Singapore', commitment: 'Full-time' }, createdAt: 1787788800000 }]);
  const result = await fetchSourceJobs(source('lever', 'https://jobs.lever.co/acme'), fetcher as typeof fetch);
  assert.equal(result.jobs[0].providerJobId, 'lev-1');
  assert.equal(result.jobs[0].employmentType, 'Full-time');
});

test('Ashby adapter uses the public job-board API', async () => {
  const fetcher = async (input: RequestInfo | URL) => {
    assert.match(String(input), /api\.ashbyhq\.com\/posting-api\/job-board\/acme/);
    return jsonResponse({ jobs: [{ id: 'ash-1', title: 'Backend Engineer', location: 'Singapore', jobUrl: 'https://jobs.ashbyhq.com/acme/ash-1', applyUrl: 'https://jobs.ashbyhq.com/acme/ash-1/application', descriptionPlain: 'Build services', publishedAt: '2026-08-27T00:00:00Z', employmentType: 'FullTime' }] });
  };
  const result = await fetchSourceJobs(source('ashby', 'https://jobs.ashbyhq.com/acme'), fetcher as typeof fetch);
  assert.equal(result.jobs[0].providerJobId, 'ash-1');
  assert.equal(result.jobs[0].title, 'Backend Engineer');
});

test('SmartRecruiters adapter pages public postings and fetches details', async () => {
  const fetcher = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (/\/postings\?/.test(url)) return jsonResponse({ totalFound: 1, content: [{ id: 'sr-1' }] });
    if (/\/postings\/sr-1$/.test(url)) return jsonResponse({ id: 'sr-1', name: 'IT Support Engineer', jobAdUrl: 'https://jobs.smartrecruiters.com/Acme/sr-1', applyUrl: 'https://jobs.smartrecruiters.com/Acme/sr-1/apply', releasedDate: '2026-08-27T00:00:00Z', location: { city: 'Singapore', country: 'Singapore' }, typeOfEmployment: { label: 'Full-time' }, jobAd: { sections: { jobDescription: { text: '<p>Support users</p>' } } } });
    return jsonResponse({}, 404);
  };
  const result = await fetchSourceJobs(source('smartrecruiters', 'https://careers.smartrecruiters.com/Acme'), fetcher as typeof fetch);
  assert.equal(result.jobs[0].providerJobId, 'sr-1');
  assert.equal(result.jobs[0].descriptionText, 'Support users');
});

test('Workday adapter parses tenant and site and keeps unknown posted date null', async () => {
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/jobs')) {
      assert.equal(init?.method, 'POST');
      return jsonResponse({ total: 1, jobPostings: [{ title: 'Software Developer', externalPath: '/job/Singapore/Software-Developer_R-123', locationsText: 'Singapore', postedOn: 'Posted 2 Days Ago' }] });
    }
    if (url.includes('/job/Singapore/Software-Developer_R-123')) {
      return jsonResponse({ jobPostingInfo: { jobDescription: '<p>Ship features</p>', timeType: 'Full time', location: 'Singapore' } });
    }
    return jsonResponse({}, 404);
  };
  const result = await fetchSourceJobs(source('workday', 'https://acme.wd5.myworkdayjobs.com/en-US/External'), fetcher as typeof fetch);
  assert.equal(result.jobs[0].providerJobId, 'R-123');
  assert.equal(result.jobs[0].postedAt, null);
  assert.equal(result.jobs[0].descriptionText, 'Ship features');
});

test('JSON-LD adapter parses an unknown official employer page', async () => {
  const fetcher = async () => htmlResponse(`
    <html><script type="application/ld+json">{
      "@context":"https://schema.org","@type":"JobPosting","title":"SOC Analyst",
      "description":"<p>Monitor threats</p>","datePosted":"2026-08-27",
      "employmentType":"FULL_TIME","url":"https://careers.acme.com/jobs/soc-1",
      "identifier":{"value":"soc-1"},"jobLocation":{"address":{"addressLocality":"Singapore","addressCountry":"SG"}}
    }</script></html>`);
  const result = await fetchSourceJobs(source('jsonld', 'https://careers.acme.com/jobs/soc-1', 'custom'), fetcher as typeof fetch);
  assert.equal(result.jobs[0].providerJobId, 'soc-1');
  assert.equal(result.jobs[0].title, 'SOC Analyst');
});

test('embedded JSON adapter finds jobs on previously unknown employer infrastructure', async () => {
  const fetcher = async () => htmlResponse(`<script id="__NEXT_DATA__" type="application/json">{"props":{"jobs":[{"id":"x1","title":"Graduate Developer","location":"Singapore","url":"/jobs/x1","description":"Build products","employmentType":"Full-time"}]}}</script>`);
  const result = await fetchSourceJobs(source('embedded_json', 'https://careers.acme.com/jobs', 'custom'), fetcher as typeof fetch);
  assert.equal(result.jobs[0].providerJobId, 'x1');
  assert.equal(result.jobs[0].canonicalUrl, 'https://careers.acme.com/jobs/x1');
});

test('generic employer HTML adapter follows bounded same-origin job links', async () => {
  const fetcher = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://careers.acme.com/openings') return htmlResponse('<a href="/openings/software-developer">Software Developer</a><a href="https://evil.example/jobs/1">Ignore</a>');
    if (url === 'https://careers.acme.com/openings/software-developer') return htmlResponse('<html><h1>Software Developer</h1><div>Singapore</div><a href="/apply/software-developer">Apply now</a></html>');
    return htmlResponse('', 404);
  };
  const result = await fetchSourceJobs(source('generic_employer_html', 'https://careers.acme.com/openings', 'custom'), fetcher as typeof fetch);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, 'Software Developer');
  assert.equal(result.jobs[0].availabilityStatus, 'verified_open');
});
