import type { JobIdentity, JobIdentityInput } from "./types.ts";

const TRACKING_PARAMS = new Set([
  "tracking", "ref", "referrer", "source", "src", "fbclid", "gclid", "msclkid",
  "gh_src", "lever-source", "lever-via", "campaign", "campaignid", "from",
]);

const normalizeText = (value?: string | null) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const smallHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const inferProviderJobId = (url: URL, provider: string) => {
  if (provider === "indeed") return url.searchParams.get("jk");
  if (provider === "workday") {
    const match = url.pathname.match(/(?:_|\/)([A-Za-z]+-\d+)(?:\/)?$/);
    return match?.[1] ?? null;
  }
  return null;
};

export function canonicalizeJobIdentity(input: JobIdentityInput): JobIdentity {
  const url = new URL(input.url.trim());
  const provider = normalizeText(input.provider) || "unknown";
  const providerJobId = input.providerJobId?.trim() || inferProviderJobId(url, provider);

  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)) url.searchParams.delete(key);
  }

  url.hash = "";
  const entries = [...url.searchParams.entries()].sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
  url.search = "";
  for (const [key, value] of entries) url.searchParams.append(key, value);

  const canonicalUrl = url.toString().replace(/\/$/, "");
  if (providerJobId) {
    return { canonicalUrl, providerJobId, identityKey: `${provider}:${providerJobId}` };
  }

  const semantic = [input.company, input.title, input.location].map(normalizeText).filter(Boolean).join("|");
  const identityKey = semantic ? `fallback:${smallHash(`${canonicalUrl}|${semantic}`)}` : `url:${canonicalUrl}`;
  return { canonicalUrl, providerJobId: null, identityKey };
}
