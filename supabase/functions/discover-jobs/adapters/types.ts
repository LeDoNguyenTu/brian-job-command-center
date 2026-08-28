import type { DiscoverySourceRecord, NormalizedJob } from '../core/types.ts';

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type AdapterResult = {
  source: DiscoverySourceRecord;
  status: 'success' | 'failed';
  jobs: NormalizedJob[];
  httpStatus?: number | null;
  error?: string | null;
};
