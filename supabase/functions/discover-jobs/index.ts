import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleDiscoveryRequest } from './orchestrator.ts';

Deno.serve(handleDiscoveryRequest);
