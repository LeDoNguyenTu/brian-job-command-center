import type { NormalizedJob } from '../core/types.ts';

export type ExistingSourceJob = {
  id: number;
  sourceId: string;
  providerJobId: string | null;
  canonicalUrl: string | null;
  pipeline: string;
  missingFromSourceCount: number;
  firstSeenAt: string | null;
};

type SnapshotInput = {
  now: string;
  sourceFetchSucceeded: boolean;
  fetchedJobs: NormalizedJob[];
  existingJobs: ExistingSourceJob[];
};

type InsertOperation = NormalizedJob & { firstSeenAt: string; lastSeenAt: string; lastVerifiedAt: string };
type RefreshOperation = { id: number; lastSeenAt: string; lastVerifiedAt: string; availabilityStatus: NormalizedJob['availabilityStatus']; availabilityEvidence: string; postedAt: string | null; missingFromSourceCount: 0 };
type MissingOperation = { id: number; missingFromSourceCount: number };
type CloseOperation = { id: number; availabilityStatus: 'closed'; availabilityEvidence: string };

const identity = (job: Pick<NormalizedJob, 'sourceId' | 'providerJobId' | 'canonicalUrl'>) => job.providerJobId ? `${job.sourceId}:id:${job.providerJobId}` : `${job.sourceId}:url:${job.canonicalUrl}`;
const existingIdentity = (job: ExistingSourceJob) => job.providerJobId ? `${job.sourceId}:id:${job.providerJobId}` : `${job.sourceId}:url:${job.canonicalUrl ?? ''}`;
const protectedPipeline = (pipeline: string) => !['Discovered', 'Review', 'Rejected', 'Closed'].includes(pipeline);

export function reconcileSourceSnapshot(input: SnapshotInput) {
  const inserts: InsertOperation[] = [];
  const refreshes: RefreshOperation[] = [];
  const missingUpdates: MissingOperation[] = [];
  const closes: CloseOperation[] = [];
  if (!input.sourceFetchSucceeded) return { inserts, refreshes, missingUpdates, closes };

  const existing = new Map(input.existingJobs.map((job) => [existingIdentity(job), job]));
  const seen = new Set<string>();
  for (const job of input.fetchedJobs) {
    if (job.availabilityStatus !== 'verified_open') continue;
    const key = identity(job);
    seen.add(key);
    const found = existing.get(key);
    if (!found) {
      inserts.push({ ...job, firstSeenAt: input.now, lastSeenAt: input.now, lastVerifiedAt: input.now });
      continue;
    }
    refreshes.push({
      id: found.id,
      lastSeenAt: input.now,
      lastVerifiedAt: input.now,
      availabilityStatus: job.availabilityStatus,
      availabilityEvidence: job.availabilityEvidence,
      postedAt: job.postedAt,
      missingFromSourceCount: 0,
    });
  }

  for (const old of input.existingJobs) {
    if (seen.has(existingIdentity(old))) continue;
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
    case 'manual': return { sourceLimit: 30, runSourceDiscovery: true, dryRun: false };
    case 'dry-run': return { sourceLimit: 20, runSourceDiscovery: true, dryRun: true };
    case 'maintenance': return { sourceLimit: 20, runSourceDiscovery: false, dryRun: false };
    case 'diagnostic': return { sourceLimit: 5, runSourceDiscovery: false, dryRun: true };
    default: return { sourceLimit: 10, runSourceDiscovery: false, dryRun: false };
  }
}
