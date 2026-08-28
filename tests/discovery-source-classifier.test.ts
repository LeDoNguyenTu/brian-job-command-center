import test from "node:test";
import assert from "node:assert/strict";
import { classifyRecruitmentSource } from "../supabase/functions/discover-jobs/core/source-classifier.ts";

test("recognizes major ATS families without treating them as an allowlist", () => {
  const fixtures = [
    ["https://acme.wd3.myworkdayjobs.com/en-US/External", "workday"],
    ["https://jobs.eu.lever.co/acme", "lever"],
    ["https://job-boards.greenhouse.io/acme", "greenhouse"],
    ["https://jobs.ashbyhq.com/acme", "ashby"],
    ["https://careers.smartrecruiters.com/Acme", "smartrecruiters"],
    ["https://jobs.acme.com/", "successfactors", '<script src="https://career5.successfactors.eu/career"></script>'],
    ["https://careers.acme.com/", "oracle", '<script src="/hcmUI/CandidateExperience"></script>'],
    ["https://jobs.acme.com/", "icims", '<script src="https://cdn.icims.com/a.js"></script>'],
    ["https://careers.acme.com/", "pageup", '<a href="https://secure.dc2.pageuppeople.com/apply">Apply</a>'],
    ["https://apply.workable.com/acme/", "workable"],
    ["https://acme.recruitee.com/", "recruitee"],
    ["https://careers.acme.teamtailor.com/", "teamtailor"],
    ["https://jobs.jobvite.com/acme/", "jobvite"],
    ["https://acme.avature.net/careers", "avature"],
    ["https://acme.bamboohr.com/careers", "bamboohr"],
    ["https://neutron.careers-page.com/jobs/abc", "manatal"],
    ["https://jobs.acme.icims.com/jobs/search", "icims"],
    ["https://acme.taleo.net/careersection", "oracle"],
    ["https://acme.fa.ap1.oraclecloud.com/hcmUI/CandidateExperience", "oracle"],
  ] as const;

  for (const [url, provider, html = ""] of fixtures) {
    const result = classifyRecruitmentSource({ url, html, verifiedEmployerHosts: ["acme.com"] });
    assert.equal(result.provider, provider, url);
  }
});

test("uses JSON-LD or embedded JSON generic adapters on unknown employer infrastructure", () => {
  const jsonld = classifyRecruitmentSource({
    url: "https://careers.example.com/jobs/1",
    html: '<script type="application/ld+json">{"@type":"JobPosting"}</script>',
    verifiedEmployerHosts: ["example.com"],
  });
  assert.equal(jsonld.adapter, "jsonld");
  assert.equal(jsonld.sourceClass, "generic_employer");

  const embedded = classifyRecruitmentSource({
    url: "https://careers.example.com/jobs",
    html: '<script id="__NEXT_DATA__" type="application/json">{"props":{"jobs":[]}}</script>',
    verifiedEmployerHosts: ["example.com"],
  });
  assert.equal(embedded.adapter, "embedded_json");
});

test("falls back to bounded generic employer HTML for a verified unknown career site", () => {
  const result = classifyRecruitmentSource({
    url: "https://careers.example.com/openings",
    html: '<html><a href="/openings/software-engineer">Software Engineer</a></html>',
    verifiedEmployerHosts: ["example.com"],
  });
  assert.equal(result.adapter, "generic_employer_html");
  assert.equal(result.sourceClass, "generic_employer");
});
