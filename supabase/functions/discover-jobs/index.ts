import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleDiscoveryEntrypoint } from './manual-fetch-wrapper.ts';

Deno.serve(handleDiscoveryEntrypoint);
