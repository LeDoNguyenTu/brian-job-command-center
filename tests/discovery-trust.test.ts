import test from "node:test";
import assert from "node:assert/strict";
import { assessSourceTrust } from "../supabase/functions/discover-jobs/core/trust.ts";

test("trusts recognized ATS infrastructure", () => {
  for (const url of [
    "https://acme.wd5.myworkdayjobs.com/en-US/External",
    "https://neutron.careers-page.com/jobs/f657725f-d6d1-4d0e-b047-171fced79f0e",
  ]) {
    const result = assessSourceTrust({ url });
    assert.equal(result.trusted, true, url);
    assert.equal(result.level, "official", url);
  }
});

test("trusts a verified employer career subdomain even when ATS is unknown", () => {
  const result = assessSourceTrust({
    url: "https://careers.example.com/openings",
    verifiedEmployerHosts: ["example.com"],
  });
  assert.equal(result.trusted, true);
  assert.equal(result.level, "official");
});

test("does not accept an unknown host merely because it claims itself as the employer", () => {
  const result = assessSourceTrust({
    url: "https://fake-employer.example/jobs",
    verifiedEmployerHosts: ["fake-employer.example"],
  });
  assert.equal(result.trusted, false);
  assert.equal(result.level, "untrusted");
});

test("rejects free-hosting, shortener and aggregator sources", () => {
  for (const url of [
    "https://example.github.io/jobs/acme",
    "https://bit.ly/acme-jobs",
    "https://jobs.example.blogspot.com/role",
    "https://sg.indeed.com/viewjob?jk=123",
    "https://flexmatrix.html-5.me/remote-jobs/backend-developer-6",
    "https://worksynergy.10001mb.com/remote-jobs/software-engineer-intern",
    "https://jobtrail.web1337.net/remote-jobs/software-engineer-intern",
    "https://miragely.liveblog365.com/remote-jobs/backend-developer-singapore",
    "https://jquasar.42web.io/remote-jobs/backend-developer-6",
    "https://taskworks.totalh.net/remote-jobs/backend-developer-6",
    "https://workflowza.zya.me/job/applied-ai-engineer-finance-super-app-singapore",
  ]) {
    const result = assessSourceTrust({ url });
    assert.equal(result.trusted, false, url);
  }
});

test("does not trust deceptive subdomains", () => {
  const result = assessSourceTrust({
    url: "https://careers.example.com.attacker.tld/jobs",
    verifiedEmployerHosts: ["example.com"],
  });
  assert.equal(result.trusted, false);
});
