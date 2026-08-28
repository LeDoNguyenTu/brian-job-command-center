import { classifyRecruitmentSource } from '../core/source-classifier.ts';
import { assessSourceTrust } from '../core/trust.ts';
import type { SourceAdapter, SourceClass, SourceTrustLevel } from '../core/types.ts';

export type SearchSourceCandidate = {
  url: string;
  title?: string;
  snippet?: string;
  html?: string;
  verifiedEmployerHosts?: string[];
};

export type SourceProposal = {
  kind: 'source';
  source: {
    company: string;
    displayName: string;
    canonicalUrl: string;
    employerHost: string | null;
    sourceClass: Exclude<SourceClass, 'quarantine'>;
    provider: string;
    adapter: Exclude<SourceAdapter, 'unsupported'>;
    detectorConfidence: number;
    fingerprintEvidence: string[];
    trustLevel: Exclude<SourceTrustLevel, 'untrusted'>;
    discoveredVia: 'web_search';
  };
} | {
  kind: 'quarantine';
  url: string;
  reason: string;
  provider: string;
  sourceClass: SourceClass;
};

const ROLE_LIKE_TITLE = /\b(?:engineer|developer|analyst|architect|intern|graduate|junior|senior|manager|specialist|consultant|support|devops|sre|programmer|technician)\b/i;

const humanizeSlug = (slug: string) => slug
  .replace(/[-_]+/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const companyFromTitleOrHost = (title: string | undefined, hostname: string) => {
  const titleCompany = title?.split(/\s[-|:]\s| careers?\b| jobs?\b/i)[0]?.trim();
  if (titleCompany && titleCompany.length >= 2 && titleCompany.length <= 120) return titleCompany;
  const first = hostname.replace(/^www\.|^careers\.|^jobs\./, '').split('.')[0];
  return first ? humanizeSlug(first) : 'Unknown employer';
};

const sourceSlug = (url: URL, provider: string) => {
  const parts = url.pathname.split('/').filter(Boolean);
  if (['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'recruitee', 'teamtailor'].includes(provider)) {
    return parts[0] ?? null;
  }
  if (provider === 'workday') {
    return url.hostname.split('.')[0] || null;
  }
  return null;
};

const companyForRecruitmentSource = (title: string | undefined, url: URL, provider: string) => {
  const slug = sourceSlug(url, provider);
  if (slug && (!title || ROLE_LIKE_TITLE.test(title))) return humanizeSlug(slug);
  return companyFromTitleOrHost(title, url.hostname);
};

const hostMatches = (hostname: string, root: string) => hostname === root || hostname.endsWith(`.${root}`);

export function canonicalizeDiscoverySourceRoot(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if (hostMatches(hostname, 'indeed.com')) {
    const jk = url.searchParams.get('jk');
    url.hash = '';
    url.search = jk ? `?jk=${encodeURIComponent(jk)}` : '';
    return url.toString().replace(/\/$/, '');
  }

  if (hostMatches(hostname, 'greenhouse.io')) {
    url.protocol = 'https:';
    url.hostname = 'job-boards.greenhouse.io';
    url.port = '';
    url.pathname = parts[0] ? `/${parts[0]}` : '/';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }

  if (hostMatches(hostname, 'lever.co')) {
    url.protocol = 'https:';
    url.hostname = 'jobs.lever.co';
    url.port = '';
    url.pathname = parts[0] ? `/${parts[0]}` : '/';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }

  if (hostMatches(hostname, 'ashbyhq.com')) {
    url.protocol = 'https:';
    url.hostname = 'jobs.ashbyhq.com';
    url.port = '';
    url.pathname = parts[0] ? `/${parts[0]}` : '/';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }

  if (hostMatches(hostname, 'smartrecruiters.com')) {
    url.protocol = 'https:';
    url.hostname = 'careers.smartrecruiters.com';
    url.port = '';
    url.pathname = parts[0] ? `/${parts[0]}` : '/';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }

  if (hostMatches(hostname, 'myworkdayjobs.com')) {
    const locale = /^[a-z]{2}-[A-Z]{2}$/.test(parts[0] ?? '') ? parts[0] : 'en-US';
    const site = /^[a-z]{2}-[A-Z]{2}$/.test(parts[0] ?? '') ? parts[1] : parts[0];
    if (site) {
      url.pathname = `/${locale}/${site}`;
      url.search = '';
      url.hash = '';
      return url.toString().replace(/\/$/, '');
    }
  }

  const careerIndex = parts.findIndex((part) => /^(jobs?|careers?|openings?|positions?|vacancies?|roles?)$/i.test(part));
  if (careerIndex >= 0) url.pathname = '/' + parts.slice(0, careerIndex + 1).join('/');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function isIndividualBoardListing(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const path = url.pathname;

  if (hostMatches(hostname, 'indeed.com')) {
    return Boolean(url.searchParams.get('jk')) || /\/viewjob(?:\/|$)/i.test(path);
  }
  if (hostMatches(hostname, 'linkedin.com')) {
    return /\/jobs\/view\/(?:[^/]+-)?\d+(?:\/|$)/i.test(path);
  }
  if (hostMatches(hostname, 'jobstreet.com') || hostMatches(hostname, 'jobstreet.com.sg') || hostMatches(hostname, 'seek.com.au')) {
    return /\/job\/\d+(?:\/|$)/i.test(path);
  }
  if (hostMatches(hostname, 'mycareersfuture.gov.sg')) {
    return /\/job\//i.test(path) && /[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i.test(path);
  }
  if (hostMatches(hostname, 'glints.com')) {
    return /\/opportunities\/jobs\//i.test(path);
  }
  if (hostMatches(hostname, 'itviec.com')) {
    return /\/it-jobs\//i.test(path);
  }
  if (hostMatches(hostname, 'topcv.vn')) {
    return /\/viec-lam\//i.test(path) && /\d+(?:\.html)?\/?$/i.test(path);
  }
  if (hostMatches(hostname, 'vietnamworks.com')) {
    return /(?:-|\/)jv(?:-|\/|$)|\/job\//i.test(path);
  }

  return false;
}

export function proposeDiscoverySource(input: SearchSourceCandidate): SourceProposal {
  let url: URL;
  try { url = new URL(input.url); } catch {
    return { kind: 'quarantine', url: input.url, reason: 'Invalid source URL', provider: 'unknown', sourceClass: 'quarantine' };
  }

  const fingerprint = classifyRecruitmentSource({
    url: input.url,
    html: input.html,
    verifiedEmployerHosts: input.verifiedEmployerHosts,
  });

  if (fingerprint.sourceClass === 'verified_board' && fingerprint.adapter === 'verified_board') {
    if (!isIndividualBoardListing(url)) {
      return {
        kind: 'quarantine',
        url: input.url,
        reason: 'Verified job board URL is not an individual vacancy listing',
        provider: fingerprint.provider,
        sourceClass: 'verified_board',
      };
    }
    const company = companyFromTitleOrHost(input.title, url.hostname);
    return {
      kind: 'source',
      source: {
        company,
        displayName: company,
        canonicalUrl: url.toString(),
        employerHost: null,
        sourceClass: 'verified_board',
        provider: fingerprint.provider,
        adapter: 'verified_board',
        detectorConfidence: fingerprint.confidence,
        fingerprintEvidence: fingerprint.evidence,
        trustLevel: 'verified_board',
        discoveredVia: 'web_search',
      },
    };
  }

  const trust = assessSourceTrust({ url: input.url, verifiedEmployerHosts: input.verifiedEmployerHosts });
  if (!trust.trusted || fingerprint.sourceClass === 'quarantine' || fingerprint.adapter === 'unsupported') {
    return {
      kind: 'quarantine',
      url: input.url,
      reason: trust.reason,
      provider: fingerprint.provider,
      sourceClass: fingerprint.sourceClass,
    };
  }

  const company = companyForRecruitmentSource(input.title, url, fingerprint.provider);
  return {
    kind: 'source',
    source: {
      company,
      displayName: company,
      canonicalUrl: canonicalizeDiscoverySourceRoot(input.url),
      employerHost: input.verifiedEmployerHosts?.[0] ?? url.hostname,
      sourceClass: fingerprint.sourceClass as Exclude<SourceClass, 'quarantine'>,
      provider: fingerprint.provider,
      adapter: fingerprint.adapter as Exclude<SourceAdapter, 'unsupported'>,
      detectorConfidence: fingerprint.confidence,
      fingerprintEvidence: fingerprint.evidence,
      trustLevel: 'official',
      discoveredVia: 'web_search',
    },
  };
}
