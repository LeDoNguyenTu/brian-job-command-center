import type { DiscoverySourceRecord } from '../core/types.ts';
import type { AdapterResult, FetchLike } from './types.ts';
import { boundedError } from './common.ts';
import { fetchGreenhouse } from './greenhouse.ts';
import { fetchLever } from './lever.ts';
import { fetchAshby } from './ashby.ts';
import { fetchSmartRecruiters } from './smartrecruiters.ts';
import { fetchWorkday } from './workday.ts';
import { fetchJsonLd } from './jsonld.ts';
import { fetchEmbeddedJson } from './embedded-json.ts';
import { fetchGenericEmployerHtml } from './generic-employer-html.ts';
import { fetchVerifiedBoard } from './verified-board.ts';

export async function fetchSourceJobs(source: DiscoverySourceRecord, fetcher: FetchLike = fetch): Promise<AdapterResult> {
  try {
    switch (source.adapter) {
      case 'greenhouse': return await fetchGreenhouse(source, fetcher);
      case 'lever': return await fetchLever(source, fetcher);
      case 'ashby': return await fetchAshby(source, fetcher);
      case 'smartrecruiters': return await fetchSmartRecruiters(source, fetcher);
      case 'workday': return await fetchWorkday(source, fetcher);
      case 'jsonld': return await fetchJsonLd(source, fetcher);
      case 'embedded_json': return await fetchEmbeddedJson(source, fetcher);
      case 'generic_employer_html': return await fetchGenericEmployerHtml(source, fetcher);
      case 'verified_board': return await fetchVerifiedBoard(source, fetcher);
      default: return { source, status: 'failed', jobs: [], error: `Unsupported source adapter: ${source.adapter}` };
    }
  } catch (error) {
    return { source, status: 'failed', jobs: [], httpStatus: typeof (error as { status?: unknown })?.status === 'number' ? Number((error as { status: number }).status) : null, error: boundedError(error) };
  }
}

export type { AdapterResult, FetchLike } from './types.ts';
