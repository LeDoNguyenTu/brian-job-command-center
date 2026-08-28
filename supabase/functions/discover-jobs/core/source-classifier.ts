import { assessSourceTrust, BOARD_SUFFIXES, hostMatches } from "./trust.ts";
import type { SourceAdapter, SourceClass, SourceFingerprint } from "./types.ts";

type ClassifierInput = {
  url: string;
  html?: string;
  verifiedEmployerHosts?: string[];
};

type FingerprintRule = {
  provider: string;
  adapter: SourceAdapter;
  sourceClass: SourceClass;
  host?: RegExp;
  html?: RegExp;
};

const RULES: FingerprintRule[] = [
  { provider: "workday", adapter: "workday", sourceClass: "direct_structured", host: /(?:^|\.)myworkdayjobs\.com$/i },
  { provider: "greenhouse", adapter: "greenhouse", sourceClass: "direct_structured", host: /(?:^|\.)greenhouse\.io$/i },
  { provider: "lever", adapter: "lever", sourceClass: "direct_structured", host: /(?:^|\.)lever\.co$/i },
  { provider: "ashby", adapter: "ashby", sourceClass: "direct_structured", host: /(?:^|\.)ashbyhq\.com$/i },
  { provider: "smartrecruiters", adapter: "smartrecruiters", sourceClass: "direct_structured", host: /(?:^|\.)smartrecruiters\.com$/i },
  { provider: "successfactors", adapter: "generic_employer_html", sourceClass: "generic_employer", host: /(?:^|\.)(?:successfactors\.com|successfactors\.eu)$/i, html: /successfactors\.(?:com|eu)|career\d*\.successfactors/i },
  { provider: "oracle", adapter: "generic_employer_html", sourceClass: "generic_employer", host: /(?:^|\.)(?:taleo\.net|oraclecloud\.com)$/i, html: /hcmUI\/CandidateExperience|oraclecloud|taleo/i },
  { provider: "icims", adapter: "generic_employer_html", sourceClass: "generic_employer", host: /(?:^|\.)icims\.com$/i, html: /(?:^|[./])icims\.com|icims/i },
  { provider: "pageup", adapter: "generic_employer_html", sourceClass: "generic_employer", host: /(?:^|\.)pageuppeople\.com$/i, html: /pageuppeople\.com|PageUp/i },
  { provider: "workable", adapter: "generic_employer_html", sourceClass: "generic_employer", host: /(?:^|\.)workable\.com$/i },
  { provider: "recruitee", adapter: "generic_employer_html", sourceClass: "generic_employer", host: /(?:^|\.)recruitee\.com$/i },
  { provider: "teamtailor", adapter: "generic_employer_html", sourceClass: "generic_employer", host: /(?:^|\.)teamtailor\.com$/i },
  { provider: "jobvite", adapter: "generic_employer_html", sourceClass: "generic_employer", host: /(?:^|\.)jobvite\.com$/i },
  { provider: "avature", adapter: "generic_employer_html", sourceClass: "generic_employer", host: /(?:^|\.)avature\.net$/i },
  { provider: "bamboohr", adapter: "generic_employer_html", sourceClass: "generic_employer", host: /(?:^|\.)bamboohr\.com$/i },
  { provider: "phenom", adapter: "generic_employer_html", sourceClass: "generic_employer", host: /(?:^|\.)phenompeople\.com$/i },
  { provider: "eightfold", adapter: "generic_employer_html", sourceClass: "generic_employer", host: /(?:^|\.)eightfold\.ai$/i },
  { provider: "personio", adapter: "generic_employer_html", sourceClass: "generic_employer", host: /(?:^|\.)personio\.(?:com|de)$/i },
  { provider: "manatal", adapter: "generic_employer_html", sourceClass: "generic_employer", host: /(?:^|\.)careers-page\.com$/i },
];

const boardHost = (hostname: string) => BOARD_SUFFIXES.some((root) => hostMatches(hostname, root));

export function classifyRecruitmentSource(input: ClassifierInput): SourceFingerprint {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return { provider: "unknown", adapter: "unsupported", sourceClass: "quarantine", confidence: 0, evidence: ["invalid_url"] };
  }

  const hostname = url.hostname.toLowerCase();
  const html = (input.html ?? "").slice(0, 1_000_000);

  for (const rule of RULES) {
    const hostMatch = rule.host?.test(hostname) ?? false;
    const htmlMatch = rule.html?.test(html) ?? false;
    if (hostMatch || htmlMatch) {
      return {
        provider: rule.provider,
        adapter: rule.adapter,
        sourceClass: rule.sourceClass,
        confidence: hostMatch ? 0.99 : 0.9,
        evidence: [hostMatch ? `host:${rule.provider}` : `markup:${rule.provider}`],
      };
    }
  }

  if (/type=["']application\/ld\+json["'][^>]*>[\s\S]{0,200000}["']?@type["']?\s*:\s*["']JobPosting["']/i.test(html)) {
    return { provider: "generic", adapter: "jsonld", sourceClass: "generic_employer", confidence: 0.9, evidence: ["jsonld:JobPosting"] };
  }

  if (/__NEXT_DATA__|__NUXT__|application\/json|window\.__INITIAL_STATE__/i.test(html)) {
    const trust = assessSourceTrust({ url: input.url, verifiedEmployerHosts: input.verifiedEmployerHosts });
    if (trust.trusted) {
      return { provider: "generic", adapter: "embedded_json", sourceClass: "generic_employer", confidence: 0.78, evidence: ["embedded_json", trust.reason] };
    }
  }

  if (boardHost(hostname)) {
    return { provider: "job_board", adapter: "verified_board", sourceClass: "verified_board", confidence: 0.7, evidence: ["known_job_board"] };
  }

  const trust = assessSourceTrust({ url: input.url, verifiedEmployerHosts: input.verifiedEmployerHosts });
  if (trust.trusted) {
    return { provider: "custom", adapter: "generic_employer_html", sourceClass: "generic_employer", confidence: 0.65, evidence: [trust.reason] };
  }

  return { provider: "unknown", adapter: "unsupported", sourceClass: "quarantine", confidence: 0.1, evidence: [trust.reason] };
}
