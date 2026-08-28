import type { NormalizedJob } from '../core/types.ts';

export type ExistingSourceJob = {
  id: number;
  sourceId: string;
  providerJobId: string | null;
  canonicalUrl: string | null;
  pipeline: string;
  missingFromSourceCount: number;
  firstSeenAt: string | null;
  postedAt?: string | null;
};

type SnapshotInput = {
  now: string;
  sourceFetchSucceeded: boolean;
  fetchedJobs: NormalizedJob[];
  existingJobs: ExistingSourceJob[];
};

type InsertOperation = NormalizedJob & { firstSeenAt: string; lastSeenAt: string; lastVerifiedAt: string };
type RefreshOperation = {
  id: number;
  providerJobId: string | null;
  canonicalUrl: string;
  lastSeenAt: string;
  lastVerifiedAt: string;
  availabilityStatus: NormalizedJob['availabilityStatus'];
  availabilityEvidence: string;
  postedAt: string | null;
  missingFromSourceCount: 0;
};
type MissingOperation = { id: number; missingFromSourceCount: number };
type CloseOperation = { id: number; availabilityStatus: 'closed'; availabilityEvidence: string };

const providerIdentity = (sourceId: string, providerJobId: string | null) => providerJobId ? `${sourceId}:id:${providerJobId}` : null;
const urlIdentity = (sourceId: string, canonicalUrl: string | null) => canonicalUrl ? `${sourceId}:url:${canonicalUrl}` : null;
const protectedPipeline = (pipeline: string) => !['Discovered', 'Review', 'Rejected', 'Closed'].includes(pipeline);

export function reconcileSourceSnapshot(input: SnapshotInput) {
  const inserts: InsertOperation[] = [];
  const refreshes: RefreshOperation[] = [];
  const missingUpdates: MissingOperation[] = [];
  const closes: CloseOperation[] = [];
  if (!input.sourceFetchSucceeded) return { inserts, refreshes, missingUpdates, closes };

  const byProviderId = new Map<string, ExistingSourceJob>();
  const byCanonicalUrl = new Map<string, ExistingSourceJob>();
  for (const existing of input.existingJobs) {
    const providerKey = providerIdentity(existing.sourceId, existing.providerJobId);
    const urlKey = urlIdentity(existing.sourceId, existing.canonicalUrl);
    if (providerKey) byProviderId.set(providerKey, existing);
    if (urlKey) byCanonicalUrl.set(urlKey, existing);
  }

  const seenIds = new Set<number>();
  for (const job of input.fetchedJobs) {
    const providerKey = providerIdentity(job.sourceId, job.providerJobId);
    const urlKey = urlIdentity(job.sourceId, job.canonicalUrl);
    const found = (providerKey ? byProviderId.get(providerKey) : undefined) ?? (urlKey ? byCanonicalUrl.get(urlKey) : undefined);

    if (job.availabilityStatus === 'closed') {
      if (found) {
        seenIds.add(found.id);
        if (!protectedPipeline(found.pipeline)) {
          closes.push({ id: found.id, availabilityStatus: 'closed', availabilityEvidence: job.availabilityEvidence });
        }
      }
      continue;
    }

    if (job.availabilityStatus !== 'verified_open') continue;
    if (!found) {
      inserts.push({ ...job, firstSeenAt: input.now, lastSeenAt: input.now, lastVerifiedAt: input.now });
      continue;
    }

    seenIds.add(found.id);
    refreshes.push({
      id: found.id,
      providerJobId: job.providerJobId ?? found.providerJobId,
      canonicalUrl: job.canonicalUrl || found.canonicalUrl || '',
      lastSeenAt: input.now,
      lastVerifiedAt: input.now,
      availabilityStatus: job.availabilityStatus,
      availabilityEvidence: job.availabilityEvidence,
      postedAt: job.postedAt ?? found.postedAt ?? null,
      missingFromSourceCount: 0,
    });
  }

  for (const old of input.existingJobs) {
    if (seenIds.has(old.id)) continue;
    const nextMissing = old.missingFromSourceCount + 1;
    missingUpdates.push({ id: old.id, missingFromSourceCount: nextMissing });
    if (nextMissing >= 2 && !protectedPipeline(old.pipeline)) {
      closes.push({ id: old.id, availabilityStatus: 'closed', availabilityEvidence: 'Missing from two consecutive successful source crawls' });
    }
  }
  return { inserts, refreshes, missingUpdates, closes };
}

export type DiscoveryAction = 'scheduled' | 'manual' | 'dry-run' | 'maintenance' | 'diagnostic';
export function planDiscoveryRun(action: DiscoveryAction) {
  switch (action) {
    case 'manual': return { sourceLimit: 1, runSourceDiscovery: true, dryRun: false };
    case 'dry-run': return { sourceLimit: 1, runSourceDiscovery: true, dryRun: true };
    case 'maintenance': return { sourceLimit: 1, runSourceDiscovery: false, dryRun: false };
    case 'diagnostic': return { sourceLimit: 1, runSourceDiscovery: false, dryRun: true };
    default: return { sourceLimit: 1, runSourceDiscovery: false, dryRun: false };
  }
}