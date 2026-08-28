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

const companyFromTitleOrHost = (title: string | undefined, hostname: string) => {
  const titleCompany = title?.split(/\s[-|:]\s| careers?\b| jobs?\b/i)[0]?.trim();
  if (titleCompany && titleCompany.length >= 2 && titleCompany.length <= 120) return titleCompany;
  const first = hostname.replace(/^www\.|^careers\.|^jobs\./, '').split('.')[0];
  return first ? first.replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) : 'Unknown employer';
};

const hostMatches = (hostname: string, root: string) => hostname === root || hostname.endsWith(`.${root}`);

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

  const company = companyFromTitleOrHost(input.title, url.hostname);
  return {
    kind: 'source',
    source: {
      company,
      displayName: company,
      canonicalUrl: url.toString().replace(/\/$/, ''),
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
