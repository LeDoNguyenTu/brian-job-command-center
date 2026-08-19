import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";
import { strFromU8, unzipSync } from "npm:fflate@0.8.2";

const allowedOrigins = new Set([
  "https://brian-job.vercel.app",
  "http://terminal.local:4173",
  "http://localhost:4173",
]);

const isAllowedOrigin = (origin: string) =>
  allowedOrigins.has(origin) ||
  /^https:\/\/brian-job-command-center(?:-[a-z0-9]+)*\.vercel\.app$/i.test(origin);

const jsonHeaders = (request: Request) => {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin)
      ? origin
      : "https://brian-job.vercel.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
};

const responseJson = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders(request) });

type JobRecord = {
  id: number;
  company: string;
  position: string;
  role_track: string;
  location: string;
  work_mode: string;
  employment_type: string | null;
  source: string | null;
  job_url: string | null;
  career_page: string | null;
  ats_platform: string | null;
  matched_skills: string[];
  gaps_risks: string | null;
  sponsorship: string;
  salary: string | null;
  job_description: string | null;
};

type ProfileRecord = {
  full_name: string;
  preferred_name: string;
  nationality: string;
  current_pass: string;
  pass_expiry: string;
  available_from: string;
  languages: string[];
  mandarin_proficiency: boolean;
  singapore_citizen_or_pr: boolean;
  sponsorship_required: boolean;
  location: string;
};

type ResumeRecord = {
  code: string;
  name: string;
  storage_path: string | null;
  original_filename: string | null;
};

type ProviderSettings = {
  document_provider: "gemini" | "openai_compatible";
  document_model: string;
  document_endpoint: string | null;
  document_provider_configured: boolean;
};

type ResumeEntry = {
  title: string;
  detail?: string;
  date?: string;
  bullets?: string[];
};

type ResumeSection = {
  heading: string;
  entries: ResumeEntry[];
};

type GeneratedContent = {
  resume: {
    headline: string;
    summary: string;
    skills: Array<{ label: string; value: string }>;
    sections: ResumeSection[];
  };
  cover_letter: {
    greeting: string;
    paragraphs: string[];
    closing: string;
  };
};

const decodeXml = (value: string) => value
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));

function extractDocxText(bytes: Uint8Array) {
  const archive = unzipSync(bytes);
  const document = archive["word/document.xml"];
  if (!document) throw new Error("The selected DOCX does not contain a readable document body.");
  const xml = strFromU8(document);
  return decodeXml(xml
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, ""))
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const clean = (value: unknown, max = 2000) => String(value ?? "")
  .replace(/[\u2013\u2014]/g, "-")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, max);

function buildExternalPrompt(job: JobRecord, profile: ProfileRecord, resume: ResumeRecord, baseline: string) {
  const description = job.job_description?.trim() || "Full job description is not stored. Use only the role details below and flag missing information.";
  return `Create a tailored one-page ATS-readable resume and a concise one-page cover letter for this exact job.

NON-NEGOTIABLE FACT RULES
- Use only facts that appear in the baseline resume or verified applicant facts below.
- Never invent employment, achievements, metrics, projects, certifications, degrees, dates, languages, visa status, or technical skills.
- Do not claim Mandarin proficiency. The applicant speaks Vietnamese and English only.
- The applicant requires employer sponsorship for a Singapore S Pass.
- Do not hide or misrepresent work authorization.
- Preserve numeric evidence exactly. Do not improve or round metrics.
- Use plain hyphens only. Do not use em dashes or en dashes.

OUTPUT AND ATS RULES
- If your service can create files, export the resume and cover letter as separate PDFs.
- Resume must be exactly one A4 page, use at least 85% of the printable page height, and remain readable.
- Use a single-column layout with real text, standard headings, no tables, icons, text boxes, graphics, or multi-column sidebars.
- Keep the applicant's concise, evidence-led writing style.
- Put the strongest job-relevant evidence first and remove only less relevant detail.
- Include relevant exact keywords from the job description naturally. Do not keyword-stuff.
- Keep contact details from the baseline unchanged.
- Cover letter must be specific to the company and role, direct, and free of generic filler.

JOB INFORMATION
Company: ${job.company}
Position: ${job.position}
Role track: ${job.role_track}
Location: ${job.location}
Work mode: ${job.work_mode}
Employment type: ${job.employment_type || "Not specified"}
Source: ${job.source || "Not specified"}
ATS platform: ${job.ats_platform || "Not specified"}
Job URL: ${job.job_url || "Not stored"}
Matched skills: ${(job.matched_skills || []).join(", ") || "Not pre-scored"}
Known risks or checks: ${job.gaps_risks || "Confirm sponsorship and all mandatory requirements"}
Sponsorship note: ${job.sponsorship}
Expected salary note: ${job.salary || "Use the applicable S Pass minimum only after verifying the current MOM rule"}

FULL JOB DESCRIPTION
${description}

VERIFIED APPLICANT FACTS
Name: ${profile.full_name}
Preferred name: ${profile.preferred_name}
Nationality: ${profile.nationality}
Current pass: ${profile.current_pass}, expires ${profile.pass_expiry}
Available from: ${profile.available_from}
Current location: ${profile.location}
Languages: ${profile.languages.join(", ")}
Mandarin proficient: ${profile.mandarin_proficiency ? "Yes" : "No"}
Singapore citizen or PR: ${profile.singapore_citizen_or_pr ? "Yes" : "No"}
Employer sponsorship required: ${profile.sponsorship_required ? "Yes" : "No"}

SELECTED BASELINE
Resume name: ${resume.name}
Resume code: ${resume.code}

BASELINE RESUME TEXT
${baseline}`;
}

const structuredSuffix = `

Return JSON only, using exactly this structure:
{
  "resume": {
    "headline": "job-targeted headline",
    "summary": "3 to 5 concise sentences",
    "skills": [{"label":"Category","value":"comma-separated verified skills"}],
    "sections": [{"heading":"EXPERIENCE","entries":[{"title":"Exact role or project title","detail":"Exact organization or technology line","date":"Exact date","bullets":["Evidence-led bullet"]}]}]
  },
  "cover_letter": {
    "greeting": "Dear Hiring Team,",
    "paragraphs": ["Opening paragraph", "Evidence paragraph", "Fit and sponsorship paragraph"],
    "closing": "Sincerely, followed by the candidate full name from PROFILE"
  }
}

Use 4 to 6 resume sections. Keep 20 to 30 total resume bullets, each below 180 characters. Include education and certifications as sections. Keep the cover letter between 260 and 380 words. Do not wrap the JSON in Markdown.`;

const jsonSchema = {
  type: "OBJECT",
  required: ["resume", "cover_letter"],
  properties: {
    resume: {
      type: "OBJECT",
      required: ["headline", "summary", "skills", "sections"],
      properties: {
        headline: { type: "STRING" },
        summary: { type: "STRING" },
        skills: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            required: ["label", "value"],
            properties: { label: { type: "STRING" }, value: { type: "STRING" } },
          },
        },
        sections: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            required: ["heading", "entries"],
            properties: {
              heading: { type: "STRING" },
              entries: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  required: ["title"],
                  properties: {
                    title: { type: "STRING" },
                    detail: { type: "STRING" },
                    date: { type: "STRING" },
                    bullets: { type: "ARRAY", items: { type: "STRING" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    cover_letter: {
      type: "OBJECT",
      required: ["greeting", "paragraphs", "closing"],
      properties: {
        greeting: { type: "STRING" },
        paragraphs: { type: "ARRAY", items: { type: "STRING" } },
        closing: { type: "STRING" },
      },
    },
  },
};

function extractJson(value: string) {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The provider did not return structured document content.");
  return JSON.parse(trimmed.slice(start, end + 1));
}

function normalizeGenerated(value: unknown): GeneratedContent {
  const root = value as Partial<GeneratedContent>;
  if (!root?.resume || !root?.cover_letter) throw new Error("The provider response is missing required document sections.");
  const sections = Array.isArray(root.resume.sections) ? root.resume.sections.slice(0, 7).map((section) => ({
    heading: clean(section?.heading, 80).toUpperCase(),
    entries: Array.isArray(section?.entries) ? section.entries.slice(0, 8).map((entry) => ({
      title: clean(entry?.title, 180),
      detail: clean(entry?.detail, 220),
      date: clean(entry?.date, 50),
      bullets: Array.isArray(entry?.bullets) ? entry.bullets.slice(0, 6).map((bullet) => clean(bullet, 220)).filter(Boolean) : [],
    })).filter((entry) => entry.title) : [],
  })).filter((section) => section.heading && section.entries.length) : [];

  const normalized: GeneratedContent = {
    resume: {
      headline: clean(root.resume.headline, 220),
      summary: clean(root.resume.summary, 900),
      skills: Array.isArray(root.resume.skills) ? root.resume.skills.slice(0, 10).map((skill) => ({
        label: clean(skill?.label, 60),
        value: clean(skill?.value, 500),
      })).filter((skill) => skill.label && skill.value) : [],
      sections,
    },
    cover_letter: {
      greeting: clean(root.cover_letter.greeting, 120) || "Dear Hiring Team,",
      paragraphs: Array.isArray(root.cover_letter.paragraphs)
        ? root.cover_letter.paragraphs.slice(0, 6).map((paragraph) => clean(paragraph, 1600)).filter(Boolean)
        : [],
      closing: clean(root.cover_letter.closing, 160) || "Sincerely,",
    },
  };
  if (!normalized.resume.headline || !normalized.resume.summary || !normalized.resume.sections.length || !normalized.cover_letter.paragraphs.length) {
    throw new Error("The provider response is incomplete. No documents were saved.");
  }
  return normalized;
}

async function callProvider(settings: ProviderSettings, key: string, prompt: string) {
  if (settings.document_provider === "gemini") {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.document_model)}:generateContent`;
    const providerResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${prompt}${structuredSuffix}` }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 12000,
          response_mime_type: "application/json",
          response_schema: jsonSchema,
        },
      }),
    });
    const body = await providerResponse.json().catch(() => null);
    if (!providerResponse.ok) {
      const detail = clean(body?.error?.message || body?.message || `Provider returned ${providerResponse.status}`, 400);
      throw new Error(detail);
    }
    const text = body?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("");
    if (!text) throw new Error("The provider returned no document content.");
    return normalizeGenerated(extractJson(text));
  }

  if (!settings.document_endpoint) throw new Error("The custom provider endpoint is not configured.");
  const endpoint = new URL(settings.document_endpoint);
  const host = endpoint.hostname.toLowerCase();
  if (endpoint.protocol !== "https:" || host === "localhost" || host === "127.0.0.1" || host === "::1" || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error("The custom provider endpoint must be a public HTTPS address.");
  }
  const providerResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model: settings.document_model,
      messages: [{ role: "user", content: `${prompt}${structuredSuffix}` }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });
  const body = await providerResponse.json().catch(() => null);
  if (!providerResponse.ok) {
    const detail = clean(body?.error?.message || body?.message || `Provider returned ${providerResponse.status}`, 400);
    throw new Error(detail);
  }
  const text = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error("The provider returned no document content.");
  return normalizeGenerated(extractJson(text));
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = clean(text, 5000).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

type DrawContext = {
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  baseSize: number;
  leadingScale: number;
  draw: boolean;
  y: number;
};

const navy = rgb(0.08, 0.20, 0.36);
const gray = rgb(0.38, 0.40, 0.43);
const black = rgb(0.07, 0.07, 0.08);

function drawLines(ctx: DrawContext, text: string, options: {
  font?: PDFFont; size?: number; x?: number; width?: number; color?: ReturnType<typeof rgb>; indent?: number;
}) {
  const font = options.font || ctx.regular;
  const size = options.size || ctx.baseSize;
  const x = options.x ?? 40;
  const width = options.width ?? 515;
  const indent = options.indent ?? 0;
  const lines = wrapText(text, font, size, width - indent);
  const lineHeight = size * 1.16 * ctx.leadingScale;
  for (const line of lines) {
    if (ctx.draw) ctx.page.drawText(line, { x: x + indent, y: ctx.y, size, font, color: options.color || black });
    ctx.y -= lineHeight;
  }
}

function drawSectionHeading(ctx: DrawContext, heading: string) {
  ctx.y -= 2.2 * ctx.leadingScale;
  if (ctx.draw) {
    ctx.page.drawText(heading.toUpperCase(), { x: 40, y: ctx.y, size: 10.7, font: ctx.bold, color: navy });
    ctx.page.drawLine({ start: { x: 40, y: ctx.y - 2 }, end: { x: 555, y: ctx.y - 2 }, thickness: 0.7, color: navy });
  }
  ctx.y -= 12.4 * ctx.leadingScale;
}

function layoutResume(page: PDFPage, fonts: { regular: PDFFont; bold: PDFFont; italic: PDFFont }, content: GeneratedContent["resume"], header: string[], baseSize: number, leadingScale: number, draw: boolean) {
  const ctx: DrawContext = { page, ...fonts, baseSize, leadingScale, draw, y: 805 };
  const name = clean(header[0] || "Candidate", 100).toUpperCase();
  const contact = clean(header[2] || "Singapore", 250);
  if (draw) page.drawText(name, { x: 40, y: ctx.y, size: 20.5, font: fonts.bold, color: black });
  ctx.y -= 22.8;
  drawLines(ctx, content.headline, { font: fonts.bold, size: 10.7, color: navy });
  drawLines(ctx, contact, { size: 8.3, color: gray });
  drawSectionHeading(ctx, "Professional Summary");
  drawLines(ctx, content.summary, {});
  drawSectionHeading(ctx, "Technical Skills");
  for (const skill of content.skills) {
    const label = `${skill.label}:`;
    if (draw) page.drawText(label, { x: 40, y: ctx.y, size: baseSize, font: fonts.bold, color: black });
    const offset = Math.min(120, fonts.bold.widthOfTextAtSize(label, baseSize) + 4);
    const lines = wrapText(skill.value, fonts.regular, baseSize, 515 - offset);
    for (const [index, line] of lines.entries()) {
      if (draw) page.drawText(line, { x: 40 + (index === 0 ? offset : 0), y: ctx.y, size: baseSize, font: fonts.regular, color: black });
      ctx.y -= baseSize * 1.16 * leadingScale;
    }
  }
  for (const section of content.sections) {
    drawSectionHeading(ctx, section.heading);
    for (const entry of section.entries) {
      const date = clean(entry.date, 50);
      const dateWidth = date ? fonts.bold.widthOfTextAtSize(date, baseSize) : 0;
      const titleWidth = 515 - (dateWidth ? dateWidth + 12 : 0);
      const titleLines = wrapText(entry.title, fonts.bold, baseSize, titleWidth);
      for (const [index, line] of titleLines.entries()) {
        if (draw) page.drawText(line, { x: 40, y: ctx.y, size: baseSize, font: fonts.bold, color: black });
        if (draw && index === 0 && date) page.drawText(date, { x: 555 - dateWidth, y: ctx.y, size: baseSize, font: fonts.bold, color: black });
        ctx.y -= baseSize * 1.12 * leadingScale;
      }
      if (entry.detail) drawLines(ctx, entry.detail, { font: fonts.italic, size: Math.max(7.2, baseSize - 0.45), color: gray });
      for (const bullet of entry.bullets || []) {
        if (draw) page.drawText("•", { x: 51, y: ctx.y, size: baseSize, font: fonts.regular, color: black });
        drawLines(ctx, bullet, { x: 40, width: 515, indent: 23 });
      }
      ctx.y -= 1.2 * leadingScale;
    }
  }
  return ctx.y;
}

async function renderResumePdf(content: GeneratedContent["resume"], baseline: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };
  const header = baseline.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3);
  let size = 10.3;
  let leading = 1;
  let bottom = layoutResume(page, fonts, content, header, size, leading, false);
  while (bottom < 34 && size > 7.6) {
    size -= 0.2;
    bottom = layoutResume(page, fonts, content, header, size, leading, false);
  }
  if (bottom < 28) throw new Error("The generated resume is too long for a readable one-page PDF. Try generation again.");
  while (bottom > 145 && leading < 1.42) {
    const candidate = Math.min(1.42, leading + 0.04);
    const candidateBottom = layoutResume(page, fonts, content, header, size, candidate, false);
    if (candidateBottom < 34) break;
    leading = candidate;
    bottom = candidateBottom;
  }
  layoutResume(page, fonts, content, header, size, leading, true);
  return pdf.save();
}

async function renderCoverLetterPdf(content: GeneratedContent["cover_letter"], job: JobRecord, baseline: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const header = baseline.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3);
  const name = clean(header[0] || "Candidate", 100).toUpperCase();
  const contact = clean(header[2] || "Singapore", 250);
  page.drawText(name, { x: 48, y: 790, size: 20.5, font: bold, color: black });
  page.drawText(contact, { x: 48, y: 773, size: 8.4, font: regular, color: gray });
  page.drawLine({ start: { x: 48, y: 762 }, end: { x: 547, y: 762 }, thickness: 1, color: navy });
  page.drawText(`${clean(job.position, 110)} | ${clean(job.company, 90)}`, { x: 48, y: 737, size: 12, font: bold, color: navy });

  const body = [content.greeting, ...content.paragraphs, content.closing].filter(Boolean);
  let size = 10.7;
  let lineHeight = 15.2;
  const measure = () => body.reduce((total, paragraph) => total + wrapText(paragraph, regular, size, 499).length * lineHeight + 12, 0);
  while (measure() > 650 && size > 8.7) { size -= 0.2; lineHeight = size * 1.42; }
  const total = measure();
  if (total > 660) throw new Error("The generated cover letter is too long for one readable page. Try generation again.");
  const extra = Math.max(0, Math.min(11, (625 - total) / Math.max(1, body.length - 1)));
  let y = 704;
  for (const [index, paragraph] of body.entries()) {
    const lines = paragraph.includes("\n") ? paragraph.split("\n").flatMap((part) => wrapText(part, regular, size, 499)) : wrapText(paragraph, regular, size, 499);
    for (const line of lines) {
      page.drawText(line, { x: 48, y, size, font: regular, color: black });
      y -= lineHeight;
    }
    if (index < body.length - 1) y -= 12 + extra;
  }
  return pdf.save();
}

const safeSlug = (value: string) => clean(value, 90).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "job";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders(request) });
  if (request.method !== "POST") return responseJson(request, { error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) throw new Error("Service configuration is incomplete.");

    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return responseJson(request, { error: "Unauthorized" }, 401);
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const [{ data: userData }, { data: isAdmin, error: adminError }] = await Promise.all([
      userClient.auth.getUser(token),
      userClient.rpc("is_current_admin"),
    ]);
    if (!userData.user || adminError || isAdmin !== true) return responseJson(request, { error: "Unauthorized" }, 401);

    const body = await request.json().catch(() => null) as { action?: string; job_id?: number; resume_code?: string } | null;
    const action = body?.action;
    const jobId = Number(body?.job_id);
    const resumeCode = clean(body?.resume_code, 20);
    if (!Number.isSafeInteger(jobId) || jobId < 1 || !resumeCode) return responseJson(request, { error: "Select a valid job and baseline resume." }, 400);
    if (action !== "prepare_prompt" && action !== "generate") return responseJson(request, { error: "Unsupported action" }, 400);

    const service = createClient(url, serviceKey, { auth: { persistSession: false } });
    const [jobResult, profileResult, resumeResult] = await Promise.all([
      service.from("jobs").select("*").eq("id", jobId).single(),
      service.from("private_profile").select("*").eq("id", 1).single(),
      service.from("resumes").select("code,name,storage_path,original_filename").eq("code", resumeCode).single(),
    ]);
    const dataError = jobResult.error || profileResult.error || resumeResult.error;
    if (dataError) throw new Error(dataError.message);
    const job = jobResult.data as JobRecord;
    const profile = profileResult.data as ProfileRecord;
    const resume = resumeResult.data as ResumeRecord;
    if (!resume.storage_path) throw new Error("The selected baseline resume has no private DOCX file yet.");

    const { data: fileBlob, error: fileError } = await service.storage.from("resume-files").download(resume.storage_path);
    if (fileError || !fileBlob) throw new Error(fileError?.message || "The baseline resume could not be read.");
    const baseline = extractDocxText(new Uint8Array(await fileBlob.arrayBuffer()));
    const prompt = buildExternalPrompt(job, profile, resume, baseline);
    if (action === "prepare_prompt") return responseJson(request, { prompt, resume_code: resume.code, resume_name: resume.name });

    const { data: settingsData, error: settingsError } = await service.from("app_settings")
      .select("document_provider,document_model,document_endpoint,document_provider_configured")
      .eq("id", 1)
      .single();
    if (settingsError) throw new Error(settingsError.message);
    const settings = settingsData as ProviderSettings;
    if (!settings.document_provider_configured) return responseJson(request, { error: "Configure a document provider key in Security and connections first." }, 409);
    const { data: providerKey, error: keyError } = await service.rpc("read_document_provider_key_for_service");
    if (keyError || !providerKey) throw new Error("The provider key is unavailable. Save it again in Security and connections.");

    const generated = await callProvider(settings, providerKey, prompt);
    const [resumePdf, coverPdf] = await Promise.all([
      renderResumePdf(generated.resume, baseline),
      renderCoverLetterPdf(generated.cover_letter, job, baseline),
    ]);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const jobSlug = safeSlug(`${job.company}-${job.position}`);
    const resumeFilename = `${jobSlug}-${resume.code}-resume.pdf`;
    const coverFilename = `${jobSlug}-${resume.code}-cover-letter.pdf`;
    const resumePath = `${job.id}/${stamp}-${resumeFilename}`;
    const coverPath = `${job.id}/${stamp}-${coverFilename}`;

    const [resumeUpload, coverUpload] = await Promise.all([
      service.storage.from("generated-documents").upload(resumePath, resumePdf, { contentType: "application/pdf", cacheControl: "3600", upsert: false }),
      service.storage.from("generated-documents").upload(coverPath, coverPdf, { contentType: "application/pdf", cacheControl: "3600", upsert: false }),
    ]);
    const uploadError = resumeUpload.error || coverUpload.error;
    if (uploadError) {
      await service.storage.from("generated-documents").remove([resumePath, coverPath]);
      throw new Error(uploadError.message);
    }

    const { data: documents, error: insertError } = await service.from("generated_documents").insert([
      { job_id: job.id, document_type: "resume", storage_path: resumePath, filename: resumeFilename, source_resume_code: resume.code, provider: settings.document_provider, model: settings.document_model },
      { job_id: job.id, document_type: "cover_letter", storage_path: coverPath, filename: coverFilename, source_resume_code: resume.code, provider: settings.document_provider, model: settings.document_model },
    ]).select("*");
    if (insertError) {
      await service.storage.from("generated-documents").remove([resumePath, coverPath]);
      throw new Error(insertError.message);
    }
    await service.from("jobs").update({
      cv_version: `${resume.code} tailored`,
      cv_status: "Ready",
      cover_letter_status: "Ready",
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);

    return responseJson(request, { documents, resume_code: resume.code, resume_name: resume.name });
  } catch (error) {
    return responseJson(request, { error: error instanceof Error ? clean(error.message, 500) : "Document generation failed." }, 500);
  }
});
