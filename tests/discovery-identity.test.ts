import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeJobIdentity } from "../supabase/functions/discover-jobs/core/identity.ts";

test("removes tracking parameters but preserves Indeed jk identity", () => {
  const result = canonicalizeJobIdentity({
    url: "https://sg.indeed.com/viewjob?jk=ABC123&utm_source=email&tracking=foo",
    provider: "indeed",
  });
  assert.equal(result.canonicalUrl, "https://sg.indeed.com/viewjob?jk=ABC123");
  assert.equal(result.providerJobId, "ABC123");
});

test("preserves path case and uses explicit ATS id", () => {
  const result = canonicalizeJobIdentity({
    url: "https://jobs.example.com/Role/Req-ABC?utm_campaign=test",
    provider: "custom",
    providerJobId: "Req-ABC",
  });
  assert.equal(result.canonicalUrl, "https://jobs.example.com/Role/Req-ABC");
  assert.equal(result.identityKey, "custom:Req-ABC");
});

test("extracts Workday requisition id from job path when no explicit id exists", () => {
  const result = canonicalizeJobIdentity({
    url: "https://acme.wd3.myworkdayjobs.com/en-US/External/job/Singapore/Software-Engineer_R-12345?source=LinkedIn",
    provider: "workday",
  });
  assert.equal(result.providerJobId, "R-12345");
});

test("uses stable fallback fingerprint when provider id is unavailable", () => {
  const first = canonicalizeJobIdentity({
    url: "https://careers.example.com/jobs/software-engineer",
    company: "Example Pte Ltd",
    title: "Software Engineer",
    location: "Singapore",
  });
  const second = canonicalizeJobIdentity({
    url: "https://careers.example.com/jobs/software-engineer?utm_source=x",
    company: " Example Pte Ltd ",
    title: "Software  Engineer",
    location: "Singapore",
  });
  assert.equal(first.identityKey, second.identityKey);
});
