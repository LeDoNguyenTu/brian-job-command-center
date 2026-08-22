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
    keywords: [
      "software developer", "software engineer", "software engineering intern", "software developer intern", "graduate software engineer",
      "graduate developer", "associate software engineer", "junior software developer", "junior software engineer", "application developer",
      "web developer", "frontend developer", "front-end developer", "frontend engineer", "front-end engineer", "backend developer",
      "back-end developer", "backend engineer", "back-end engineer", "full stack developer", "full-stack developer", "full stack engineer",
      "full-stack engineer", "developer analyst", "programmer analyst",
    ],
    queries: [
      "graduate junior entry level software developer software engineer",
      "graduate junior frontend backend full stack developer",
    ],
    label: "software engineering",
  },
  {
    signals: ["ai/ml", "machine learning", "pytorch", "cnn", "llm", "ocr", "artificial intelligence"],
    keywords: [
      "ai engineer", "artificial intelligence engineer", "machine learning engineer", "ml engineer", "applied ai engineer", "ai developer",
      "machine learning developer", "ai intern", "machine learning intern", "ai algorithm engineer", "ai algorithms engineer", "ai research engineer",
    ],
    queries: ["graduate junior AI machine learning applied AI engineer"],
    label: "AI and machine learning",
  },
  {
    signals: ["cybersecurity", "security", "vulnerability", "oauth 2.0", "static analysis"],
    keywords: [
      "soc analyst", "soc engineer", "security analyst", "cybersecurity analyst", "cyber security analyst", "information security analyst",
      "application security engineer", "application security analyst", "security engineer", "security consultant", "cybersecurity consultant",
      "cyber security consultant", "security compliance", "security governance", "penetration tester", "penetration testing consultant",
      "security testing engineer", "vulnerability analyst", "grc analyst",
    ],
    queries: [
      "graduate junior cybersecurity SOC information security analyst",
      "graduate junior application security penetration testing vulnerability analyst",
    ],
    label: "cybersecurity",
  },
  {
    signals: ["postgresql", "supabase", "duckdb", "parquet", "data-intensive", "sql"],
    keywords: [
      "data engineer", "data platform engineer", "analytics engineer", "database developer", "database administrator", "sql developer",
      "data analyst", "business intelligence analyst",
    ],
    queries: ["graduate junior data engineer data platform SQL PostgreSQL"],
    label: "data and platform engineering",
  },
  {
    signals: ["cloud", "vercel", "supabase edge functions", "ci/cd", "devops"],
    keywords: [
      "cloud engineer", "cloud support engineer", "platform engineer", "devops engineer", "site reliability engineer", "infrastructure engineer",
      "systems engineer", "network engineer", "it support engineer", "it support specialist", "helpdesk analyst", "help desk analyst",
      "service desk analyst", "desktop support engineer", "technical support engineer", "network support engineer", "system administrator",
      "systems administrator",
    ],
    queries: [
      "graduate junior cloud infrastructure platform devops engineer",
      "graduate junior IT support helpdesk service desk network support",
    ],
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
