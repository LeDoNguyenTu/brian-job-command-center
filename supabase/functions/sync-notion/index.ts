import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const PRODUCTION_ORIGIN = "https://brian-job.vercel.app";
const ALLOWED_ORIGINS = new Set([
  PRODUCTION_ORIGIN,
  "http://terminal.local:4173",
  "http://localhost:4173",
]);

const isAllowedOrigin = (origin: string) =>
  ALLOWED_ORIGINS.has(origin) ||
  /^https:\/\/brian-job-command-center(?:-[a-z0-9]+)*\.vercel\.app$/i.test(origin);

type NotionProperty = Record<string, unknown> & { type?: string };
type NotionPage = {
  id: string;
  url?: string;
  properties?: Record<string, NotionProperty>;
};

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
      "Cache-Control": "no-store",
    },
  });
}

function richText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      return typeof record.plain_text === "string" ? record.plain_text : "";
    })
    .join("")
    .trim();
}

function propertyText(property?: NotionProperty): string {
  if (!property) return "";
  switch (property.type) {
    case "title":
      return richText(property.title);
    case "rich_text":
      return richText(property.rich_text);
    case "select":
      return String((property.select as Record<string, unknown> | null)?.name ?? "");
    case "status":
      return String((property.status as Record<string, unknown> | null)?.name ?? "");
    case "url":
      return typeof property.url === "string" ? property.url : "";
    case "email":
      return typeof property.email === "string" ? property.email : "";
    case "number":
      return property.number === null || property.number === undefined ? "" : String(property.number);
    case "formula": {
      const formula = property.formula as Record<string, unknown> | undefined;
      if (!formula || typeof formula.type !== "string") return "";
      const value = formula[formula.type];
      return value === null || value === undefined ? "" : String(value);
    }
    default:
      return "";
  }
}

function propertyArray(property?: NotionProperty): string[] {
  if (!property) return [];
  if (property.type === "multi_select" && Array.isArray(property.multi_select)) {
    return property.multi_select
      .map((item) => (item && typeof item === "object" ? String((item as Record<string, unknown>).name ?? "") : ""))
      .filter(Boolean);
  }
  const value = propertyText(property);
  return value
    ? value.split(/[,\n|]/).map((item) => item.trim()).filter(Boolean)
    : [];
}

function propertyDate(property?: NotionProperty): string | null {
  if (!property || property.type !== "date" || !property.date || typeof property.date !== "object") return null;
  const start = (property.date as Record<string, unknown>).start;
  return typeof start === "string" ? start.slice(0, 10) : null;
}

function propertyNumber(property?: NotionProperty): number {
  if (!property) return 0;
  if (property.type === "number" && typeof property.number === "number") return property.number;
  const parsed = Number(propertyText(property));
  return Number.isFinite(parsed) ? parsed : 0;
}

function propertyCheckbox(property?: NotionProperty): boolean {
  return Boolean(property?.type === "checkbox" && property.checkbox === true);
}

function normalizeMatchLevel(value: string, score: number) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("block") || normalized.includes("exclude")) return "Blocked";
  if (normalized.includes("strong") || normalized.includes("high")) return "Strong";
  if (normalized.includes("review") || normalized.includes("medium")) return "Review";
  if (score >= 80) return "Strong";
  if (score < 50) return "Blocked";
  return "Review";
}

function mapPage(page: NotionPage) {
  const properties = page.properties ?? {};
  const score = Math.max(0, Math.min(100, Math.round(propertyNumber(properties["Match Score"]))));
  const company = propertyText(properties.Company) || "Unknown company";
  const position = propertyText(properties.Position) || "Untitled role";

  return {
    notion_page_id: page.id,
    company,
    position,
    role_track: propertyText(properties["Role Track"]) || "Other",
    match_score: score,
    match_level: normalizeMatchLevel(propertyText(properties["Match Level"]), score),
    sponsorship: propertyText(properties.Sponsorship) || "Unknown",
    location: propertyText(properties.Location) || "Singapore",
    work_mode: propertyText(properties["Work Mode"]) || "Not specified",
    date_found: propertyDate(properties["Date Found"]),
    matched_skills: propertyArray(properties["Matched Skills"]),
    gaps_risks: propertyText(properties["Gaps / Risks"]) || null,
    pipeline: propertyText(properties.Pipeline) || "Discovered",
    approved_to_apply: propertyCheckbox(properties["Approved to Apply"]),
    employment_type: propertyText(properties["Employment Type"]) || null,
    source: propertyText(properties.Source) || "Notion",
    job_url: propertyText(properties.Link) || null,
    career_page: propertyText(properties["Career Page"]) || null,
    ats_platform: propertyText(properties["ATS Platform"]) || null,
    cv_version: propertyText(properties["CV Version"]) || null,
    cv_status: propertyText(properties["CV Status"]) || null,
    cover_letter_status: propertyText(properties["Cover Letter Status"]) || null,
    ai_application_policy: propertyText(properties["AI Application Policy"]) || null,
    salary: propertyText(properties.Salary) || null,
    notion_url: page.url ?? null,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function notionText(value: unknown) {
  const content = String(value ?? "").trim().slice(0, 2000);
  return { rich_text: content ? [{ type: "text", text: { content } }] : [] };
}

function notionTitle(value: unknown) {
  const content = String(value ?? "Untitled").trim().slice(0, 2000) || "Untitled";
  return { title: [{ type: "text", text: { content } }] };
}

function notionSelect(value: string | null | undefined) {
  return { select: value ? { name: value } : null };
}

function normalizeRoleTrack(value: unknown) {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("security") && (normalized.includes("dev") || normalized.includes("app"))) return "SecurityDev";
  if (normalized.includes("security") || normalized.includes("soc") || normalized.includes("forensic")) return "Security";
  if (normalized.includes("support") || normalized.includes("infrastructure") || normalized.includes("network")) return "IT Support / Infrastructure";
  if (normalized.includes("cloud") || normalized.includes("presales")) return "Cloud / Presales";
  return "Developer";
}

function normalizeSelect(value: unknown, allowed: string[], fallback: string) {
  const candidate = String(value ?? "").trim();
  return allowed.includes(candidate) ? candidate : fallback;
}

function notionProperties(job: Record<string, unknown>) {
  const matchLevel = String(job.match_level ?? "Review");
  const matchMap: Record<string, string> = { Strong: "Strong", Review: "Stretch", Blocked: "Skip", Good: "Good" };
  const pipelineMap: Record<string, string> = {
    Review: "Reviewing",
    Preparing: "Ready to apply",
    Interview: "Technical interview",
    Blocked: "Closed",
  };
  const sponsorshipMap: Record<string, string> = {
    Available: "Confirmed",
    Possible: "Likely",
    "Not available": "Not offered",
  };
  const sourceMap: Record<string, string> = {
    "Company career page": "Company site",
    "Manual entry": "Other",
    Notion: "Other",
  };
  const cvStatusMap: Record<string, string> = { Drafting: "Drafted" };
  const coverStatusMap: Record<string, string> = { Drafting: "Drafted" };
  const dateFound = typeof job.date_found === "string" && job.date_found ? job.date_found : null;
  const jobUrl = typeof job.job_url === "string" && job.job_url ? job.job_url : null;
  const careerPage = typeof job.career_page === "string" && job.career_page ? job.career_page : null;

  return {
    Company: notionTitle(job.company),
    Position: notionText(job.position),
    "Role Track": notionSelect(normalizeRoleTrack(job.role_track)),
    "Match Score": { number: Number(job.match_score) || 0 },
    "Match Level": notionSelect(matchMap[matchLevel] || "Stretch"),
    Sponsorship: notionSelect(normalizeSelect(sponsorshipMap[String(job.sponsorship)] || job.sponsorship, ["Confirmed", "Likely", "Unknown", "Not offered", "Not required"], "Unknown")),
    Location: notionText(job.location || "Singapore"),
    "Work Mode": notionSelect(normalizeSelect(job.work_mode === "Not specified" ? "Not stated" : job.work_mode, ["On-site", "Hybrid", "Remote", "Not stated"], "Not stated")),
    "Date Found": { date: dateFound ? { start: dateFound } : null },
    "Matched Skills": notionText(Array.isArray(job.matched_skills) ? job.matched_skills.join(", ") : job.matched_skills),
    "Gaps / Risks": notionText(job.gaps_risks),
    Pipeline: notionSelect(normalizeSelect(pipelineMap[String(job.pipeline)] || job.pipeline, ["Discovered", "Reviewing", "Ready to apply", "Applied", "Recruiter screen", "Assessment", "Technical interview", "Final interview", "Offer", "Rejected", "Withdrawn", "Closed"], "Discovered")),
    "Approved to Apply": { checkbox: job.approved_to_apply === true },
    "Employment Type": notionSelect(normalizeSelect(job.employment_type, ["Full-time", "Graduate programme", "Internship", "Contract", "Part-time", "Temporary"], "Full-time")),
    Source: notionSelect(normalizeSelect(sourceMap[String(job.source)] || job.source, ["Indeed", "LinkedIn", "Company site", "Referral", "Recruiter", "Other"], "Other")),
    Link: { url: jobUrl },
    "Career Page": { url: careerPage },
    "ATS Platform": notionSelect(normalizeSelect(job.ats_platform, ["Workday", "Greenhouse", "Lever", "Ashby", "SmartRecruiters", "SuccessFactors", "Taleo", "Custom company portal", "Not known"], "Not known")),
    "CV Version": notionSelect(normalizeSelect(job.cv_version, ["Developer", "SecurityDev", "Security", "Custom"], "Custom")),
    "CV Status": notionSelect(normalizeSelect(cvStatusMap[String(job.cv_status)] || job.cv_status, ["Not started", "Drafted", "Review needed", "Ready", "Submitted"], "Not started")),
    "Cover Letter Status": notionSelect(normalizeSelect(coverStatusMap[String(job.cover_letter_status)] || job.cover_letter_status, ["Not required", "Not started", "Drafted", "Review needed", "Ready", "Submitted"], "Not started")),
    Salary: notionText(job.salary),
    "Job ID": notionText(job.id),
  };
}

async function notionRequest(token: string, path: string, method: "POST" | "PATCH", body: unknown) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": "2026-03-11",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.message === "string" ? payload.message : `Notion returned ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");

  if (!supabaseUrl || !publishableKey || !serviceRoleKey || !authorization?.startsWith("Bearer ")) {
    return json(request, { error: "Authentication is required" }, 401);
  }

  const accessToken = authorization.slice("Bearer ".length);
  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let operation: "backup" | "restore" = "backup";

  try {
    const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !userData.user) {
      return json(request, { error: "This account is not authorized" }, 403);
    }

    const { data: isAdmin, error: adminCheckError } = await userClient.rpc("is_current_admin");
    if (adminCheckError || isAdmin !== true) {
      return json(request, { error: "Administrator access was not verified" }, 403);
    }

    const requestBody = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (requestBody.action === "connect") {
      const tokenValue = typeof requestBody.token === "string" ? requestBody.token.trim() : "";
      if (tokenValue.length < 20 || tokenValue.length > 512) {
        return json(request, { error: "Enter a valid Notion integration token" }, 400);
      }
      const { error: storeError } = await adminClient.rpc("store_notion_token_for_service", {
        token_value: tokenValue,
      });
      if (storeError) throw storeError;
      await adminClient.from("app_settings").update({
        notion_connected: true,
        backup_status: "Ready",
        backup_message: "Notion backup connection saved. Run a backup after sharing the Applications database with the integration.",
      }).eq("id", 1);
      return json(request, { connected: true });
    }
    operation = requestBody.action === "restore" ? "restore" : "backup";

    const { data: token, error: tokenError } = await adminClient.rpc("read_notion_token_for_service");
    if (tokenError || typeof token !== "string" || token.length < 20) {
      return json(request, { error: "Connect Notion from Security and connections before syncing" }, 412);
    }

    const { data: settings, error: settingsError } = await adminClient
      .from("app_settings")
      .select("notion_data_source_id")
      .eq("id", 1)
      .single();
    if (settingsError || !settings?.notion_data_source_id) throw new Error("Notion data source is not configured");

    if (operation === "backup") {
      const { data: jobs, error: jobsError } = await adminClient
        .from("jobs")
        .select("*")
        .order("id", { ascending: true });
      if (jobsError) throw jobsError;

      let backedUp = 0;
      for (const job of (jobs ?? []) as Array<Record<string, unknown>>) {
        const properties = notionProperties(job);
        let page: Record<string, unknown>;
        if (typeof job.notion_page_id === "string" && job.notion_page_id) {
          page = await notionRequest(token, `/pages/${job.notion_page_id}`, "PATCH", { properties });
        } else {
          page = await notionRequest(token, "/pages", "POST", {
            parent: { type: "data_source_id", data_source_id: settings.notion_data_source_id },
            properties,
          });
        }

        const pageId = typeof page.id === "string" ? page.id : job.notion_page_id;
        const pageUrl = typeof page.url === "string" ? page.url : job.notion_url;
        const now = new Date().toISOString();
        const { error: updateError } = await adminClient
          .from("jobs")
          .update({ notion_page_id: pageId, notion_url: pageUrl, last_synced_at: now })
          .eq("id", job.id);
        if (updateError) throw updateError;
        backedUp += 1;
      }

      const now = new Date().toISOString();
      await adminClient
        .from("app_settings")
        .update({
          notion_connected: true,
          last_backup_at: now,
          backup_status: "Backed up",
          backup_message: `${backedUp} Supabase job records backed up to Notion.`,
          updated_at: now,
        })
        .eq("id", 1);

      return json(request, { backed_up: backedUp, backed_up_at: now });
    }

    const pages: NotionPage[] = [];
    let cursor: string | null = null;
    do {
      const response = await fetch(
        `https://api.notion.com/v1/data_sources/${settings.notion_data_source_id}/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Notion-Version": "2026-03-11",
          },
          body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
        },
      );

      const payload = await response.json() as Record<string, unknown>;
      if (!response.ok) {
        const message = typeof payload.message === "string" ? payload.message : `Notion returned ${response.status}`;
        throw new Error(message);
      }

      if (Array.isArray(payload.results)) pages.push(...payload.results as NotionPage[]);
      cursor = payload.has_more === true && typeof payload.next_cursor === "string" ? payload.next_cursor : null;
    } while (cursor);

    const rows = pages.map(mapPage).filter((row) => row.source !== "Prepared snapshot");
    if (rows.length > 0) {
      const { error: upsertError } = await adminClient
        .from("jobs")
        .upsert(rows, { onConflict: "notion_page_id" });
      if (upsertError) throw upsertError;
    }

    await adminClient
      .from("jobs")
      .delete()
      .eq("source", "Prepared snapshot");

    const now = new Date().toISOString();
    await adminClient
      .from("app_settings")
      .update({
        notion_connected: true,
        last_notion_sync: now,
        last_sync_status: "Synced",
        last_sync_message: `${rows.length} Notion application records synchronized.`,
        updated_at: now,
      })
      .eq("id", 1);

    return json(request, { synced: rows.length, synced_at: now });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notion operation failed";
    await adminClient
      .from("app_settings")
      .update(operation === "backup" ? {
        backup_status: "Backup failed",
        backup_message: message.slice(0, 500),
        updated_at: new Date().toISOString(),
      } : {
        last_sync_status: "Restore failed",
        last_sync_message: message.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    return json(request, { error: message }, 502);
  }
});
