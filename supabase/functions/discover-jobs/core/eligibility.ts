import type { MarketCode } from "./types.ts";

export type SponsorshipRestriction = "unknown" | "citizen_pr_only" | "no_sponsorship" | "sponsorship_available";

export type EligibilityJob = {
  marketCodes: MarketCode[];
  title: string;
  employmentType: string | null;
  requiredYears: number | null;
  mandatoryLanguages?: string[];
  preferredLanguages?: string[];
  sponsorshipRestriction?: SponsorshipRestriction;
};

export type EligibilitySettings = {
  enabledMarkets: readonly MarketCode[];
  maxRequiredYears: number;
  verifiedLanguages: readonly string[];
};

export type EligibilityDecision = {
  eligible: boolean;
  reasons: string[];
  risks: string[];
};

const SENIOR_TITLE = /\b(senior|sr\.?|staff|principal|lead|manager|director|head|vice president|vp|architect)\b/i;
const EXCLUDED_EMPLOYMENT = /\b(intern(ship)?|part[- ]?time|temporary|temp|casual|volunteer)\b/i;
const ACCEPTED_EMPLOYMENT = /\b(full[- ]?time|contract|permanent)\b/i;

const normalizeLanguage = (value: string) => value.trim().toLowerCase();

export function assessEligibility(job: EligibilityJob, settings: EligibilitySettings): EligibilityDecision {
  const reasons: string[] = [];
  const risks: string[] = [];

  if (!job.marketCodes.some((code) => settings.enabledMarkets.includes(code))) {
    reasons.push("Outside enabled APAC markets");
  }

  if (SENIOR_TITLE.test(job.title)) reasons.push("Clearly senior title");

  const employmentType = job.employmentType?.trim() ?? "";
  if (employmentType && EXCLUDED_EMPLOYMENT.test(employmentType)) {
    reasons.push(`Excluded employment type: ${employmentType}`);
  } else if (employmentType && !ACCEPTED_EMPLOYMENT.test(employmentType)) {
    risks.push(`Unrecognized employment type: ${employmentType}`);
  }

  if (typeof job.requiredYears === "number" && job.requiredYears > settings.maxRequiredYears) {
    reasons.push(`Requires ${job.requiredYears} years of experience`);
  }

  const verified = new Set(settings.verifiedLanguages.map(normalizeLanguage));
  for (const language of job.mandatoryLanguages ?? []) {
    if (!verified.has(normalizeLanguage(language))) reasons.push(`Mandatory unverified language: ${language}`);
  }
  for (const language of job.preferredLanguages ?? []) {
    if (!verified.has(normalizeLanguage(language))) risks.push(`Preferred language gap: ${language}`);
  }

  if (job.marketCodes.includes("SG")) {
    if (job.sponsorshipRestriction === "citizen_pr_only") reasons.push("Singapore citizen or PR only");
    if (job.sponsorshipRestriction === "no_sponsorship") reasons.push("Employer explicitly does not sponsor Singapore work passes");
    if (!job.sponsorshipRestriction || job.sponsorshipRestriction === "unknown") risks.push("Singapore sponsorship not confirmed");
  }

  return { eligible: reasons.length === 0, reasons, risks };
}
