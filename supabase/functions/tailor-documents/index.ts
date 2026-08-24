import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import { strFromU8, unzipSync } from "npm:fflate@0.8.2";
import { DEJAVU_SANS_BOLD, DEJAVU_SANS_REGULAR } from "./resume-fonts.ts";

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

type DocumentType = "resume" | "cover_letter";

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

const decodeBase64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

async function embedResumeFonts(pdf: PDFDocument) {
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(decodeBase64(DEJAVU_SANS_REGULAR), { subset: true });
  const bold = await pdf.embedFont(decodeBase64(DEJAVU_SANS_BOLD), { subset: true });
  return { regular, bold, italic: regular };
}

const RESUME_SECTION_HEADINGS = new Set([
  "EXPERIENCE",
  "ENGINEERING PROJECTS",
  "SELECTED PROJECTS",
  "PROJECTS",
  "EDUCATION",
  "CERTIFICATIONS",
]);

type BaselineResume = {
  header: string[];
  skills: Array<{ label: string; value: string }>;
  sections: ResumeSection[];
};

function parseBaselineResume(baseline: string): BaselineResume {
  const lines = baseline.split("\n").map((line) => line.trim()).filter(Boolean);
  const firstHeading = lines.findIndex((line) => line === "PROFESSIONAL SUMMARY");
  const skillsHeading = lines.findIndex((line) => line === "TECHNICAL SKILLS");
  const firstContentHeading = lines.findIndex((line) => RESUME_SECTION_HEADINGS.has(line));
  if (firstHeading < 3 || skillsHeading <= firstHeading || firstContentHeading <= skillsHeading) {
    throw new Error("The baseline resume structure is incomplete. Upload the original editable DOCX again before generating a tailored CV.");
  }

  const skills = lines.slice(skillsHeading + 1, firstContentHeading).map((line) => {
    const separator = line.indexOf(":");
    if (separator < 1) return null;
    return { label: clean(line.slice(0, separator), 60), value: clean(line.slice(separator + 1), 500) };
  }).filter((skill): skill is { label: string; value: string } => Boolean(skill?.label && skill.value));

  const sections: ResumeSection[] = [];
  let section: ResumeSection | null = null;
  let entry: ResumeEntry | null = null;
  const flushEntry = () => {
    if (section && entry?.title) section.entries.push(entry);
    entry = null;
  };
  const flushSection = () => {
    flushEntry();
    if (section?.entries.length) sections.push(section);
    section = null;
  };

  for (const line of lines.slice(firstContentHeading)) {
    if (RESUME_SECTION_HEADINGS.has(line)) {
      flushSection();
      section = { heading: line, entries: [] };
      continue;
    }
    if (!section) continue;
    if (section.heading === "CERTIFICATIONS") {
      section.entries.push({ title: clean(line, 240), bullets: [] });
      continue;
    }
    const tabIndex = line.lastIndexOf("\t");
    if (tabIndex > 0) {
      flushEntry();
      entry = {
        title: clean(line.slice(0, tabIndex), 240),
        date: clean(line.slice(tabIndex + 1), 60),
        bullets: [],
      };
      continue;
    }
    if (!entry) {
      entry = { title: clean(line, 240), bullets: [] };
      continue;
    }
    if (section.heading === "EDUCATION") entry.bullets?.push(clean(line, 700));
    else if (!entry.detail) entry.detail = clean(line, 360);
    else entry.bullets?.push(clean(line, 700));
  }
  flushSection();

  const totalResumeBullets = sections.reduce((total, current) =>
    total + current.entries.reduce((entryTotal, currentEntry) => entryTotal + (currentEntry.bullets?.length || 0), 0), 0);
  if (skills.length < 4 || sections.length < 3 || totalResumeBullets < 10) {
    throw new Error("The baseline resume structure is incomplete. No tailored CV was saved.");
  }
  return { header: lines.slice(0, 3), skills, sections };
}

function hasSuspiciousRepetition(value: string) {
  const words = clean(value, 8000).toLowerCase().split(/\s+/).filter(Boolean);
  const windows = new Map<string, number>();
  for (let index = 0; index <= words.length - 6; index += 1) {
    const phrase = words.slice(index, index + 6).join(" ");
    const count = (windows.get(phrase) || 0) + 1;
    if (count >= 3) return true;
    windows.set(phrase, count);
  }
  return false;
}

function buildExternalPrompt(job: JobRecord, profile: ProfileRecord, resume: ResumeRecord, baseline: string, documentType?: DocumentType) {
  const description = job.job_description?.trim() || "Full job description is not stored. Use only the role details below and flag missing information.";
  const request = documentType === "resume"
    ? "Create a tailored one-page ATS-readable resume for this exact job."
    : documentType === "cover_letter"
      ? "Create a concise one-page cover letter for this exact job."
      : "Create a tailored one-page ATS-readable resume and a concise one-page cover letter for this exact job.";
  return `${request}

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
- Do not rewrite experience, project, education, or certification entries. The system preserves those verified baseline sections exactly.
- Tailor only the headline, professional summary, and ordering of verified technical skills.
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

const structuredSuffixes: Record<DocumentType, string> = {
  resume: `

Return JSON only, using exactly this structure:
{"resume": {
    "headline": "job-targeted headline",
    "summary": "3 to 5 concise sentences",
    "skills": [{"label":"Category","value":"comma-separated verified skills"}]
  }}

Return 5 to 8 skill categories using only skills already present in the baseline. The system preserves the complete verified experience, project, education, and certification sections. Do not wrap the JSON in Markdown.`,
  cover_letter: `

Return JSON only, using exactly this structure:
{"cover_letter": {
    "greeting": "Dear Hiring Team,",
    "paragraphs": ["Opening paragraph", "Evidence paragraph", "Fit and sponsorship paragraph"],
    "closing": "Sincerely, followed by the candidate full name from PROFILE"
  }}

Keep the cover letter between 220 and 320 words. Do not wrap the JSON in Markdown.`,
};

const resumeJsonSchema = {
  type: "OBJECT", required: ["resume"], properties: {
    resume: {
      type: "OBJECT",
      required: ["headline", "summary", "skills"],
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
      },
    },
  },
};

const coverLetterJsonSchema = {
  type: "OBJECT", required: ["cover_letter"], properties: {
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

const jsonSchemas = { resume: resumeJsonSchema, cover_letter: coverLetterJsonSchema };

function extractJson(value: string) {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The provider output was cut off before the document finished. Please generate this document again.");
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("The provider output was cut off or malformed before the document finished. Please generate this document again.");
    }
    throw error;
  }
}

function normalizeGenerated(value: unknown, documentType: DocumentType): GeneratedContent[DocumentType] {
  const root = value as Partial<GeneratedContent>;
  if (documentType === "resume") {
    if (!root?.resume) throw new Error("The provider response is missing the resume section.");
    const normalizedResume: GeneratedContent["resume"] = {
      headline: clean(root.resume.headline, 220),
      summary: clean(root.resume.summary, 900),
      skills: Array.isArray(root.resume.skills) ? root.resume.skills.slice(0, 10).map((skill) => ({
        label: clean(skill?.label, 60),
        value: clean(skill?.value, 500),
      })).filter((skill) => skill.label && skill.value) : [],
      sections: [],
    };
    if (!normalizedResume.headline || !normalizedResume.summary || normalizedResume.skills.length < 4 || hasSuspiciousRepetition(`${normalizedResume.headline} ${normalizedResume.summary}`)) {
      throw new Error("The provider response is incomplete. No resume was saved.");
    }
    return normalizedResume;
  }

  if (!root?.cover_letter) throw new Error("The provider response is missing the cover letter section.");
  const normalizedCoverLetter: GeneratedContent["cover_letter"] = {
    greeting: clean(root.cover_letter.greeting, 120) || "Dear Hiring Team,",
    paragraphs: Array.isArray(root.cover_letter.paragraphs)
      ? root.cover_letter.paragraphs.slice(0, 6).map((paragraph) => clean(paragraph, 1600)).filter(Boolean)
      : [],
    closing: clean(root.cover_letter.closing, 160) || "Sincerely,",
  };
  if (!normalizedCoverLetter.paragraphs.length) throw new Error("The provider response is incomplete. No cover letter was saved.");
  return normalizedCoverLetter;
}

async function callProvider(settings: ProviderSettings, key: string, prompt: string, documentType: DocumentType) {
  if (settings.document_provider === "gemini") {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.document_model)}:generateContent`;
    const providerResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${prompt}${structuredSuffixes[documentType]}` }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 6000,
          responseMimeType: "application/json",
          responseSchema: jsonSchemas[documentType],
          thinkingConfig: { thinkingLevel: "low" },
        },
      }),
    });
    const body = await providerResponse.json().catch(() => null);
    if (!providerResponse.ok) {
      const detail = clean(body?.error?.message || body?.message || `Provider returned ${providerResponse.status}`, 400);
      throw new Error(detail);
    }
    const candidate = body?.candidates?.[0];
    if (candidate?.finishReason === "MAX_TOKENS") {
      throw new Error("The provider output was cut off before the document finished. Please generate this document again.");
    }
    const text = candidate?.content?.parts?.map((part: { text?: string }) => part.text || "").join("");
    if (!text) throw new Error("The provider returned no document content.");
    return normalizeGenerated(extractJson(text), documentType);
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
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: settings.document_model,
      messages: [{ role: "user", content: `${prompt}${structuredSuffixes[documentType]}` }],
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
  return normalizeGenerated(extractJson(text), documentType);
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
const RESUME_MARGIN = 10;
const RESUME_WIDTH = 595.28 - (RESUME_MARGIN * 2);

function drawLines(ctx: DrawContext, text: string, options: {
  font?: PDFFont; size?: number; x?: number; width?: number; color?: ReturnType<typeof rgb>; indent?: number;
}) {
  const font = options.font || ctx.regular;
  const size = options.size || ctx.baseSize;
  const x = options.x ?? RESUME_MARGIN;
  const width = options.width ?? RESUME_WIDTH;
  const indent = options.indent ?? 0;
  const lines = wrapText(text, font, size, width - indent);
  const lineHeight = size * 1.16 * ctx.leadingScale;
  for (const line of lines) {
    if (ctx.draw) ctx.page.drawText(line, { x: x + indent, y: ctx.y, size, font, color: options.color || black });
    ctx.y -= lineHeight;
  }
}

function drawSectionHeading(ctx: DrawContext, heading: string) {
  ctx.y -= 1.4 * ctx.leadingScale;
  if (ctx.draw) {
    ctx.page.drawText(heading.toUpperCase(), { x: RESUME_MARGIN, y: ctx.y, size: 8.2, font: ctx.bold, color: navy });
    ctx.page.drawLine({ start: { x: RESUME_MARGIN, y: ctx.y - 1.7 }, end: { x: 595.28 - RESUME_MARGIN, y: ctx.y - 1.7 }, thickness: 0.55, color: navy });
  }
  ctx.y -= 9.3 * ctx.leadingScale;
}

function layoutResume(page: PDFPage, fonts: { regular: PDFFont; bold: PDFFont; italic: PDFFont }, content: GeneratedContent["resume"], header: string[], baseSize: number, leadingScale: number, draw: boolean) {
  const ctx: DrawContext = { page, ...fonts, baseSize, leadingScale, draw, y: 818 };
  const name = clean(header[0] || "Candidate", 100).toUpperCase();
  const contact = clean(header[2] || "Singapore", 250);
  if (draw) page.drawText(name, { x: RESUME_MARGIN, y: ctx.y, size: 15.2, font: fonts.bold, color: black });
  ctx.y -= 16.2;
  drawLines(ctx, content.headline, { font: fonts.bold, size: 8.8, color: navy });
  drawLines(ctx, contact, { size: 7.1, color: gray });
  drawSectionHeading(ctx, "Professional Summary");
  drawLines(ctx, content.summary, {});
  drawSectionHeading(ctx, "Technical Skills");
  for (const skill of content.skills) {
    const label = `${skill.label}:`;
    if (draw) page.drawText(label, { x: RESUME_MARGIN, y: ctx.y, size: baseSize, font: fonts.bold, color: navy });
    const offset = Math.min(115, fonts.bold.widthOfTextAtSize(label, baseSize) + 3);
    const lines = wrapText(skill.value, fonts.regular, baseSize, RESUME_WIDTH - offset);
    for (const [index, line] of lines.entries()) {
      if (draw) page.drawText(line, { x: RESUME_MARGIN + (index === 0 ? offset : 0), y: ctx.y, size: baseSize, font: fonts.regular, color: black });
      ctx.y -= baseSize * 1.1 * leadingScale;
    }
  }
  for (const section of content.sections) {
    drawSectionHeading(ctx, section.heading);
    for (const entry of section.entries) {
      if (section.heading === "CERTIFICATIONS") {
        if (draw) page.drawText("•", { x: RESUME_MARGIN, y: ctx.y, size: baseSize, font: fonts.regular, color: black });
        drawLines(ctx, entry.title, { x: RESUME_MARGIN, width: RESUME_WIDTH, indent: 8 });
        continue;
      }
      const date = clean(entry.date, 50);
      const dateWidth = date ? fonts.bold.widthOfTextAtSize(date, baseSize) : 0;
      const titleWidth = RESUME_WIDTH - (dateWidth ? dateWidth + 10 : 0);
      const titleLines = wrapText(entry.title, fonts.bold, baseSize, titleWidth);
      for (const [index, line] of titleLines.entries()) {
        if (draw) page.drawText(line, { x: RESUME_MARGIN, y: ctx.y, size: baseSize, font: fonts.bold, color: black });
        if (draw && index === 0 && date) page.drawText(date, { x: 595.28 - RESUME_MARGIN - dateWidth, y: ctx.y, size: baseSize, font: fonts.regular, color: gray });
        ctx.y -= baseSize * 1.08 * leadingScale;
      }
      if (entry.detail) drawLines(ctx, entry.detail, { font: fonts.italic, size: Math.max(6.4, baseSize - 0.25), color: gray });
      for (const bullet of entry.bullets || []) {
        if (draw) page.drawText("•", { x: RESUME_MARGIN, y: ctx.y, size: baseSize, font: fonts.regular, color: black });
        drawLines(ctx, bullet, { x: RESUME_MARGIN, width: RESUME_WIDTH, indent: 8 });
      }
      ctx.y -= 0.65 * leadingScale;
    }
  }
  return ctx.y;
}

async function renderResumePdf(content: GeneratedContent["resume"], baseline: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const fonts = await embedResumeFonts(pdf);
  const baselineResume = parseBaselineResume(baseline);
  const completeContent: GeneratedContent["resume"] = {
    ...content,
    skills: content.skills.length >= 4 ? content.skills : baselineResume.skills,
    sections: baselineResume.sections,
  };
  let size = 7.5;
  let leading = 0.98;
  let bottom = layoutResume(page, fonts, completeContent, baselineResume.header, size, leading, false);
  while (bottom < 16 && size > 6.7) {
    size -= 0.1;
    bottom = layoutResume(page, fonts, completeContent, baselineResume.header, size, leading, false);
  }
  if (bottom < 10) throw new Error("The complete verified resume is too long for one readable page. Shorten the baseline resume before generating again.");
  while (bottom > 45 && leading < 1.12) {
    const candidate = Math.min(1.12, leading + 0.02);
    const candidateBottom = layoutResume(page, fonts, completeContent, baselineResume.header, size, candidate, false);
    if (candidateBottom < 16) break;
    leading = candidate;
    bottom = candidateBottom;
  }
  layoutResume(page, fonts, completeContent, baselineResume.header, size, leading, true);
  return pdf.save();
}

function coverLetterClosing(fullName: string) {
  return `Sincerely,\n${clean(fullName, 100)}`;
}

async function renderCoverLetterPdf(content: GeneratedContent["cover_letter"], job: JobRecord, baseline: string, fullName: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const { regular, bold } = await embedResumeFonts(pdf);
  const header = baseline.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3);
  const name = clean(header[0] || "Candidate", 100).toUpperCase();
  const contact = clean(header[2] || "Singapore", 250);
  page.drawText(name, { x: 48, y: 790, size: 20.5, font: bold, color: black });
  page.drawText(contact, { x: 48, y: 773, size: 8.4, font: regular, color: gray });
  page.drawLine({ start: { x: 48, y: 762 }, end: { x: 547, y: 762 }, thickness: 1, color: navy });
  page.drawText(`${clean(job.position, 110)} | ${clean(job.company, 90)}`, { x: 48, y: 737, size: 12, font: bold, color: navy });

  const body = [content.greeting, ...content.paragraphs, coverLetterClosing(fullName)].filter(Boolean);
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

    const body = await request.json().catch(() => null) as { action?: string; job_id?: number; resume_code?: string; document_type?: DocumentType } | null;
    const action = body?.action;
    const jobId = Number(body?.job_id);
    const resumeCode = clean(body?.resume_code, 20);
    const documentType = body?.document_type;
    if (!Number.isSafeInteger(jobId) || jobId < 1 || !resumeCode) return responseJson(request, { error: "Select a valid job and baseline resume." }, 400);
    if (action !== "prepare_prompt" && action !== "generate") return responseJson(request, { error: "Unsupported action" }, 400);
    if (action === "generate" && documentType !== "resume" && documentType !== "cover_letter") {
      return responseJson(request, { error: "Choose either a tailored CV or cover letter to generate." }, 400);
    }

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
    const prompt = buildExternalPrompt(job, profile, resume, baseline, action === "generate" ? documentType : undefined);
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

    const generated = await callProvider(settings, providerKey, prompt, documentType);
    const pdf = documentType === "resume"
      ? await renderResumePdf(generated as GeneratedContent["resume"], baseline)
      : await renderCoverLetterPdf(generated as GeneratedContent["cover_letter"], job, baseline, profile.full_name);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const jobSlug = safeSlug(`${job.company}-${job.position}`);
    const filename = `${jobSlug}-${resume.code}-${documentType === "resume" ? "resume" : "cover-letter"}.pdf`;
    const storagePath = `${job.id}/${stamp}-${filename}`;
    const { error: uploadError } = await service.storage.from("generated-documents")
      .upload(storagePath, pdf, { contentType: "application/pdf", cacheControl: "3600", upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { data: document, error: insertError } = await service.from("generated_documents").insert({
      job_id: job.id, document_type: documentType, storage_path: storagePath, filename,
      source_resume_code: resume.code, provider: settings.document_provider, model: settings.document_model,
    }).select("*").single();
    if (insertError) {
      await service.storage.from("generated-documents").remove([storagePath]);
      throw new Error(insertError.message);
    }
    const jobUpdate = documentType === "resume"
      ? { cv_version: `${resume.code} tailored`, cv_status: "Ready", updated_at: new Date().toISOString() }
      : { cover_letter_status: "Ready", updated_at: new Date().toISOString() };
    await service.from("jobs").update(jobUpdate).eq("id", job.id);

    return responseJson(request, { documents: [document], document_type: documentType, resume_code: resume.code, resume_name: resume.name });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return responseJson(request, { error: "The document provider took longer than 45 seconds. No files were saved. Please try again once." }, 504);
    }
    return responseJson(request, { error: error instanceof Error ? clean(error.message, 500) : "Document generation failed." }, 500);
  }
});
