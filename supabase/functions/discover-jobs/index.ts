import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { handleDiscoveryRequest } from './orchestrator.ts';

type DiscoveryResponse = {
  skipped?: boolean;
  error?: string;
  inserted?: number;
  refreshed?: number;
  sourcesAttempted?: number;
  providerAttempts?: Array<{ provider?: string; status?: string }>;
  sourceResults?: Array<{ sourceId?: string }>;
  [key: string]: unknown;
};

async function queueRemainingManualSources(body: DiscoveryResponse) {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return { queuedSources: 0, targetLocation: null as string | null };

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const processedSourceId = body.sourceResults?.[0]?.sourceId ? String(body.sourceResults[0].sourceId) : null;
  const now = new Date().toISOString();
  let queue = service.from('discovery_sources')
    .update({ next_crawl_at: now, updated_at: now })
    .eq('enabled', true);
  if (processedSourceId) queue = queue.neq('id', processedSourceId);

  const { data: queuedRows, error: queueError } = await queue.select('id');
  const { data: settings } = await service.from('app_settings')
    .select('discovery_location')
    .eq('id', 1)
    .maybeSingle();
  const targetLocation = settings?.discovery_location ? String(settings.discovery_location) : null;
  if (queueError) return { queuedSources: 0, targetLocation };

  const queuedSources = queuedRows?.length ?? 0;
  const processedSources = Number(body.sourcesAttempted ?? 0);
  const totalSources = queuedSources + processedSources;
  const inserted = Number(body.inserted ?? 0);
  const refreshed = Number(body.refreshed ?? 0);
  const summary = totalSources
    ? `Manual full-registry scan started for ${totalSources} source${totalSources === 1 ? '' : 's'}. The first safe source crawl finished with ${inserted} new and ${refreshed} refreshed; ${queuedSources} remaining source${queuedSources === 1 ? '' : 's'} will continue through the bounded scheduler.`
    : 'Manual scan completed, but there are currently no enabled sources to crawl.';

  await service.from('app_settings').update({
    discovery_status: queuedSources ? 'Running' : 'Success',
    discovery_message: summary,
    updated_at: now,
  }).eq('id', 1);

  return { queuedSources, targetLocation };
}

Deno.serve(async (request) => {
  let requestedAction: string | null = null;
  if (request.method === 'POST') {
    try {
      const body = await request.clone().json();
      requestedAction = body && typeof body === 'object' && 'action' in body ? String(body.action ?? '') : null;
    } catch {
      requestedAction = null;
    }
  }

  const response = await handleDiscoveryRequest(request);
  if (requestedAction !== 'manual' || !response.ok) return response;

  let body: DiscoveryResponse;
  try {
    body = await response.clone().json() as DiscoveryResponse;
  } catch {
    return response;
  }
  if (body.skipped || body.error) return response;

  const { queuedSources, targetLocation } = await queueRemainingManualSources(body);
  const lastUsedProvider = [...(body.providerAttempts ?? [])].reverse().find((attempt) => attempt.status === 'used')?.provider ?? null;
  const enriched = {
    ...body,
    queuedSources,
    targetLocation,
    duplicates: Number(body.refreshed ?? 0),
    webSearchProvider: lastUsedProvider,
  };
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json');
  headers.delete('content-length');
  return new Response(JSON.stringify(enriched), { status: response.status, headers });
});
