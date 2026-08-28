import test from "node:test";
import assert from "node:assert/strict";
import { assessEligibility } from "../supabase/functions/discover-jobs/core/eligibility.ts";

const settings = {
  enabledMarkets: ["SG", "VN", "MY", "TH", "ID", "PH"] as const,
  maxRequiredYears: 2,
  verifiedLanguages: ["english", "vietnamese"],
  targetRoleKeywords: [
    "software developer", "software engineer", "security analyst", "security engineer",
    "data engineer", "cloud engineer", "devops engineer", "it support engineer", "technical support engineer",
  ],
  excludedTitleKeywords: ["senior", "staff", "principal", "lead", "manager", "director", "head", "vp", "architect"],
};

test("accepts entry-level full-time or contract jobs within the experience limit", () => {
  for (const employmentType of ["Full-time", "Contract"]) {
    const result = assessEligibility({
      marketCodes: ["SG"], title: "Software Developer", employmentType,
      requiredYears: 2, mandatoryLanguages: ["English"], sponsorshipRestriction: "unknown",
    }, settings);
    assert.equal(result.eligible, true);
  }
});

test("rejects internships, part-time roles and clearly senior titles", () => {
  for (const job of [
    { title: "Software Engineering Intern", employmentType: "Internship" },
    { title: "IT Support Engineer", employmentType: "Part-time" },
    { title: "Senior Software Engineer", employmentType: "Full-time" },
  ]) {
    const result = assessEligibility({
      marketCodes: ["SG"], requiredYears: 1, mandatoryLanguages: ["English"], sponsorshipRestriction: "unknown", ...job,
    }, settings);
    assert.equal(result.eligible, false, job.title);
  }
});

test("rejects roles outside enabled APAC markets", () => {
  const result = assessEligibility({
    marketCodes: [], title: "Software Engineer", employmentType: "Full-time",
    requiredYears: 1, mandatoryLanguages: ["English"], sponsorshipRestriction: "unknown",
  }, settings);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.some((reason) => /outside enabled apac markets/i.test(reason)));
});

test("rejects non-target titles even when descriptions mention technical or security terms", () => {
  for (const title of ["Business Development Representative", "Legal Counsel", "Warehouse Operations Associate", "Accounts Payable Clerk"]) {
    const result = assessEligibility({
      marketCodes: ["SG"], title, employmentType: "Full-time",
      requiredYears: 0, mandatoryLanguages: ["English"], sponsorshipRestriction: "unknown",
    }, settings);
    assert.equal(result.eligible, false, title);
    assert.ok(result.reasons.some((reason) => /target role/i.test(reason)), title);
  }
});

test("uses configured excluded title keywords as a hard gate", () => {
  const result = assessEligibility({
    marketCodes: ["SG"], title: "Staff Software Engineer", employmentType: "Full-time",
    requiredYears: 0, mandatoryLanguages: ["English"], sponsorshipRestriction: "unknown",
  }, settings);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.some((reason) => /excluded title/i.test(reason)));
});

test("rejects experience requirements above the configured maximum", () => {
  const result = assessEligibility({
    marketCodes: ["SG"], title: "Software Engineer", employmentType: "Full-time",
    requiredYears: 3, mandatoryLanguages: ["English"], sponsorshipRestriction: "unknown",
  }, settings);
  assert.equal(result.eligible, false);
});

test("rejects mandatory unverified languages but not preferences", () => {
  const mandatory = assessEligibility({
    marketCodes: ["SG"], title: "Security Analyst", employmentType: "Full-time", requiredYears: 1,
    mandatoryLanguages: ["Mandarin"], preferredLanguages: [], sponsorshipRestriction: "unknown",
  }, settings);
  assert.equal(mandatory.eligible, false);

  const preferred = assessEligibility({
    marketCodes: ["SG"], title: "Security Analyst", employmentType: "Full-time", requiredYears: 1,
    mandatoryLanguages: ["English"], preferredLanguages: ["Mandarin"], sponsorshipRestriction: "unknown",
  }, settings);
  assert.equal(preferred.eligible, true);
  assert.ok(preferred.risks.some((risk) => /preferred language/i.test(risk)));
});

test("applies sponsorship hard blocks only to Singapore roles", () => {
  const singapore = assessEligibility({
    marketCodes: ["SG"], title: "Software Developer", employmentType: "Full-time", requiredYears: 1,
    mandatoryLanguages: ["English"], sponsorshipRestriction: "citizen_pr_only",
  }, settings);
  assert.equal(singapore.eligible, false);

  const vietnam = assessEligibility({
    marketCodes: ["VN"], title: "Software Developer", employmentType: "Full-time", requiredYears: 1,
    mandatoryLanguages: ["English"], sponsorshipRestriction: "citizen_pr_only",
  }, settings);
  assert.equal(vietnam.eligible, true);
});
