export type MarketCode = 'SG' | 'VN' | 'MY' | 'TH' | 'ID' | 'PH';
export type SourceClass = 'direct_structured' | 'generic_employer' | 'verified_board' | 'quarantine';
export type SourceTrustLevel = 'official' | 'verified_board' | 'untrusted';
export type SourceAdapter =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'smartrecruiters'
  | 'workday'
  | 'jsonld'
  | 'embedded_json'
  | 'generic_employer_html'
  | 'verified_board'
  | 'unsupported';

export type JobIdentityInput = {
  url: string;
  provider?: string | null;
  providerJobId?: string | null;
  company?: string | null;
  title?: string | null;
  location?: string | null;
};

export type JobIdentity = {
  canonicalUrl: string;
  providerJobId: string | null;
  identityKey: string;
};

export type SourceTrustAssessment = {
  trusted: boolean;
  level: SourceTrustLevel;
  reason: string;
};

export type SourceFingerprint = {
  provider: string;
  adapter: SourceAdapter;
  sourceClass: SourceClass;
  confidence: number;
  evidence: string[];
};

export type AvailabilityStatus = 'verified_open' | 'verification_pending' | 'closed';

export type DiscoverySourceRecord = {
  id: string;
  company: string;
  displayName: string;
  canonicalUrl: string;
  employerHost?: string | null;
  sourceClass: SourceClass;
  provider: string;
  adapter: SourceAdapter | string;
  marketCodes: MarketCode[];
  trustLevel: SourceTrustLevel;
  adapterConfig: Record<string, unknown>;
};

export type NormalizedJob = {
  sourceId: string;
  sourceClass: SourceClass;
  provider: string;
  providerJobId: string | null;
  canonicalUrl: string;
  applyUrl: string;
  company: string;
  title: string;
  locations: string[];
  countryCodes: MarketCode[];
  employmentType: string | null;
  descriptionText: string;
  postedAt: string | null;
  validThrough: string | null;
  availabilityStatus: AvailabilityStatus;
  availabilityEvidence: string;
  retrievedAt: string;
};
