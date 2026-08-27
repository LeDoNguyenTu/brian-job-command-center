import type { DiscoverySourceRecord } from '../core/types.ts';
import type { AdapterResult, FetchLike } from './types.ts';
import { fetchText } from './common.ts';
import { parseJsonLdJobsFromHtml } from './jsonld.ts';

export async function fetchVerifiedBoard(source: DiscoverySourceRecord, fetcher: FetchLike): Promise<AdapterResult> {
  const { text } = await fetchText(fetcher, source.canonicalUrl);
  const jobs = parseJsonLdJobsFromHtml(source, text).map((job) => ({ ...job, sourceClass: 'verified_board' as const, availabilityEvidence: `Verified board listing: ${job.availabilityEvidence}` }));
  return { source, status: 'success', jobs };
}
