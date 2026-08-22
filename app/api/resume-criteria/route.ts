import { createClient } from "@supabase/supabase-js";
import mammoth from "mammoth";
import { extractText } from "unpdf";

export const runtime = "nodejs";

const DEFAULT_EXCLUDED_TITLES = [
  "senior", "sr", "staff", "principal", "lead", "leader", "manager", "head", "director", "vice president", "vp", "architect", "expert",
];

const ROLE_GROUPS = [
  {
    signals: ["typescript", "javascript", "react", "next.js", "node.js", "fastapi", "software developer", "full-stack", "backend", "frontend"],
    keywords: ["software", "application", "web", "backend", "frontend", "full stack", "developer", "engineer", "typescript", "javascript", "python", "react", "next.js", "node.js", "fastapi"],
    queries: ["graduate junior entry level software developer engineer", "graduate junior full stack backend developer"],
    label: "software engineering",
  },
  {
    signals: ["ai/ml", "machine learning", "pytorch", "cnn", "llm", "ocr", "artificial intelligence"],
    keywords: ["artificial intelligence", "ai", "machine learning", "ml engineer", "data scientist", "research engineer", "pytorch", "llm", "ocr"],
    queries: ["graduate junior entry level AI machine learning engineer", "graduate junior applied AI developer"],
    label: "AI and machine learning",
  },
  {
    signals: ["cybersecurity", "security", "vulnerability", "oauth 2.0", "static analysis"],
    keywords: ["security", "cyber", "soc", "vulnerability", "penetration test", "grc", "information security", "application security"],
    queries: ["graduate junior entry level cybersecurity SOC analyst", "graduate junior application security engineer"],
    label: "cybersecurity",
  },
  {
    signals: ["postgresql", "supabase", "duckdb", "parquet", "data-intensive", "sql"],
    keywords: ["data engineer", "data analyst", "database", "sql", "postgresql", "platform engineer"],
    queries: ["graduate junior data platform engineer SQL PostgreSQL"],
    label: "data and platform engineering",
  },
  {
    signals: ["cloud", "vercel", "supabase edge functions", "ci/cd", "devops"],
    keywords: ["cloud engineer", "devops", "site reliability", "infrastructure", "systems administrator", "network engineer"],
    queries: ["graduate junior cloud platform devops engineer"],
    label: "cloud and platform",
  },
];

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildSuggestion(text: string) {
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  const matchedGroups = ROLE_GROUPS.filter((group) => group.signals.some((signal) => normalized.includes(signal)));
  const selectedGroups = matchedGroups.length ? matchedGroups : ROLE_GROUPS.slice(0, 1);
  const skills = unique(selectedGroups.flatMap((group) => group.signals.filter((signal) => normalized.includes(signal)))).slice(0, 14);
  return {
    search_queries: unique(selectedGroups.flatMap((group) => group.queries)).slice(0, 8),
    target_role_keywords: unique(selectedGroups.flatMap((group) => group.keywords)),
    excluded_title_keywords: DEFAULT_EXCLUDED_TITLES,
    max_required_years: /graduate|entry level|entry-level|junior|student/i.test(text) ? 1 : 2,
    detected_skills: skills,
    rationale: `Suggested from the resume's ${selectedGroups.map((group) => group.label).join(", ")} evidence. Nothing changes until you approve this proposal.`,
  };
}

async function extractResumeText(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "docx" || file.type.includes("wordprocessingml")) {
    return (await mammoth.extractRawText({ buffer })).value;
  }
  if (extension === "pdf" || file.type === "application/pdf") {
    const result = await extractText(new Uint8Array(buffer), { mergePages: true });
    return result.text;
  }
  throw new Error("Only DOCX and PDF resumes can be analysed.");
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xwsergbpvkcsugexssmc.supabase.co";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_ZyCh_dhmxHpZ-OX5tLP2aQ_nFNno42X";
  const client = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: userData }, { data: isAdmin, error: adminError }] = await Promise.all([
    client.auth.getUser(authorization.slice(7)),
    client.rpc("is_current_admin"),
  ]);
  if (!userData.user || adminError || isAdmin !== true) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Attach a DOCX or PDF resume." }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return Response.json({ error: "Resume files must be 8 MB or smaller." }, { status: 413 });

  try {
    const text = await extractResumeText(file);
    if (text.trim().length < 150) return Response.json({ error: "The resume did not contain enough readable text." }, { status: 422 });
    return Response.json({ suggestion: buildSuggestion(text) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The resume could not be analysed." }, { status: 422 });
  }
}
