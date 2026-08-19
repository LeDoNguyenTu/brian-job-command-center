import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PRODUCTION_ORIGIN = "https://brian-job.vercel.app";
const ALLOWED_ORIGINS = new Set([
  PRODUCTION_ORIGIN,
  "http://terminal.local:4173",
  "http://localhost:4173",
]);

const isAllowedOrigin = (origin: string) =>
  ALLOWED_ORIGINS.has(origin) ||
  /^https:\/\/brian-job-command-center(?:-[a-z0-9]+)*\.vercel\.app$/i.test(origin);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? PRODUCTION_ORIGIN;
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : PRODUCTION_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

Deno.serve((request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  const turnstileSiteKey = [
    "TURNSTILE_SITE_KEY",
    "CLOUDFLARE_TURNSTILE_SITE_KEY",
    "CLOUDFLARE_SITE_KEY",
    "CF_TURNSTILE_SITE_KEY",
  ]
    .map((name) => Deno.env.get(name)?.trim())
    .find((value) => value);

  if (!turnstileSiteKey) {
    return json(request, { error: "Cloudflare Turnstile site key is not configured" }, 503);
  }

  return json(request, { turnstileSiteKey });
});
