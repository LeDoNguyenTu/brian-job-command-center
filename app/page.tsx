"use client";

import Image from "next/image";
import { FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const FALLBACK_NOTION_HUB =
  "https://www.notion.so/";
const MOM_S_PASS =
  "https://www.mom.gov.sg/passes-and-permits/s-pass/eligibility";
const JOBS_PER_PAGE = 10;
const DEFAULT_DISCOVERY_QUERIES = [
  "graduate junior entry level software developer software engineer",
  "graduate junior frontend backend full stack developer",
  "graduate junior AI machine learning applied AI engineer",
  "graduate junior cybersecurity SOC information security analyst",
  "graduate junior application security penetration testing vulnerability analyst",
  "graduate junior data engineer data platform SQL PostgreSQL",
  "graduate junior cloud infrastructure platform devops engineer",
  "graduate junior IT support helpdesk service desk network support",
];
const DISCOVERY_COUNTRIES = [
  ["singapore", "Singapore"], ["malaysia", "Malaysia"], ["vietnam", "Vietnam"],
  ["thailand", "Thailand"], ["indonesia", "Indonesia"], ["philippines", "Philippines"],
  ["australia", "Australia"],
] as const;

type Resume = {
  code: string;
  name: string;
  fit: string;
  recommendation: string;
  tone: string;
  notion_url: string | null;
  sort_order: number;
  storage_path?: string | null;
  original_filename?: string | null;
  resume_files?: ResumeFile[];
};

type ResumeFile = {
  id: number;
  resume_code: string;
  file_format: "docx" | "pdf";
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
};

type DiscoveryCriteriaSuggestion = {
  search_queries: string[];
  target_role_keywords: string[];
  excluded_title_keywords: string[];
  max_required_years: number;
  detected_skills: string[];
  rationale: string;
};

type LearnedDiscoverySource = {
  host: string;
  company: string;
  atsPlatform: string;
  bestScore: number;
  matches: number;
  lastSeen: string;
  feedUrl: string | null;
  promoted: boolean;
};

type PrivateProfile = {
  full_name: string;
  preferred_name: string;
  date_of_birth: string;
  nationality: string;
  current_pass: string;
  pass_expiry: string;
  available_from: string;
  languages: string[];
  mandarin_proficiency: boolean;
  singapore_citizen_or_pr: boolean;
  sponsorship_required: boolean;
  location: string;
  notion_url: string | null;
};

type AppSettings = {
  notion_connected: boolean;
  notion_hub_url: string;
  last_notion_sync: string | null;
  last_sync_status: string;
  last_sync_message: string | null;
  auto_sync_enabled: boolean;
  primary_data_source?: string;
  last_backup_at?: string | null;
  backup_status?: string;
  backup_message?: string | null;
  discovery_enabled?: boolean;
  discovery_time?: string;
  discovery_timezone?: string;
  discovery_source_urls?: string[];
  discovery_web_search_enabled?: boolean;
  discovery_web_search_configured?: boolean;
  discovery_search_queries?: string[];
  discovery_target_role_keywords?: string[];
  discovery_excluded_title_keywords?: string[];
  discovery_criteria_suggestion?: DiscoveryCriteriaSuggestion | null;
  discovery_criteria_suggestion_status?: "none" | "pending" | "approved" | "rejected";
  discovery_criteria_suggestion_source_resume?: string | null;
  discovery_criteria_suggestion_created_at?: string | null;
  discovery_max_required_years?: number;
  discovery_location?: string;
  discovery_country?: string;
  discovery_web_search_provider?: "automatic" | "tavily" | "exa" | "firecrawl" | "brave" | "serpapi" | "serper";
  discovery_tavily_configured?: boolean;
  discovery_exa_configured?: boolean;
  discovery_firecrawl_configured?: boolean;
  discovery_brave_configured?: boolean;
  discovery_serpapi_configured?: boolean;
  discovery_serper_configured?: boolean;
  discovery_last_provider?: string | null;
  discovery_provider_status?: Array<{
    provider: string;
    status: string;
    reason: string;
    results: number;
    httpStatus?: number | null;
    checkedAt?: string | null;
    zeroCreditCheck?: boolean;
  }>;
  discovery_monthly_credit_cap?: number;
  discovery_last_credit_usage?: number | null;
  discovery_last_credit_limit?: number | null;
  discovery_source_learning_enabled?: boolean;
  discovery_learned_sources?: LearnedDiscoverySource[];
  last_discovery_at?: string | null;
  last_scheduled_discovery_date?: string | null;
  discovery_status?: string;
  discovery_message?: string | null;
  document_provider?: "gemini" | "openai_compatible";
  document_model?: string;
  document_endpoint?: string | null;
  document_provider_configured?: boolean;
  document_provider_updated_at?: string | null;
  session_timeout_minutes?: number;
};

type JobRow = {
  id: number;
  notion_page_id: string | null;
  company: string;
  position: string;
  role_track: string;
  match_score: number;
  match_level: string;
  sponsorship: string;
  location: string;
  work_mode: string;
  date_found: string | null;
  matched_skills: string[];
  gaps_risks: string | null;
  pipeline: string;
  approved_to_apply: boolean;
  saved: boolean;
  notion_url: string | null;
  job_url: string | null;
  employment_type: string | null;
  source: string | null;
  career_page: string | null;
  ats_platform: string | null;
  cv_version: string | null;
  cv_status: string | null;
  cover_letter_status: string | null;
  salary: string | null;
  job_description: string | null;
};

type Job = {
  id: number;
  company: string;
  initials: string;
  role: string;
  track: string;
  score: number;
  match: "Strong" | "Review" | "Blocked";
  sponsorship: string;
  location: string;
  mode: string;
  found: string;
  tags: string[];
  note: string;
  tone: string;
  pipeline: string;
  approved: boolean;
  notionUrl: string | null;
  jobUrl: string | null;
  dateFound: string | null;
  employmentType: string | null;
  source: string | null;
  careerPage: string | null;
  atsPlatform: string | null;
  cvVersion: string | null;
  cvStatus: string | null;
  coverLetterStatus: string | null;
  salary: string | null;
  jobDescription: string | null;
};

type JobDraft = {
  id?: number;
  company: string;
  position: string;
  role_track: string;
  match_score: string;
  match_level: "Strong" | "Review" | "Blocked";
  sponsorship: string;
  location: string;
  work_mode: string;
  date_found: string;
  matched_skills: string;
  gaps_risks: string;
  pipeline: string;
  approved_to_apply: boolean;
  employment_type: string;
  source: string;
  job_url: string;
  career_page: string;
  ats_platform: string;
  cv_version: string;
  cv_status: string;
  cover_letter_status: string;
  salary: string;
  job_description: string;
};

type GeneratedDocument = {
  id: number;
  job_id: number;
  document_type: "resume" | "cover_letter";
  storage_path: string;
  filename: string;
  source_resume_code: string;
  provider: string;
  model: string;
  created_at: string;
};

type ResumeSuggestion = {
  code: string;
  name: string;
  score: number;
  color: "green" | "yellow" | "red";
  label: string;
  guidance: string;
};

type ApplicationAnswer = {
  id: string;
  category: "Identity" | "Eligibility" | "Role-specific" | "Manual check";
  label: string;
  value: string;
  ready: boolean;
  note?: string;
};

const EMPTY_JOB: JobDraft = {
  company: "",
  position: "",
  role_track: "Software",
  match_score: "70",
  match_level: "Review",
  sponsorship: "Unknown",
  location: "Singapore",
  work_mode: "Not specified",
  date_found: new Date().toISOString().slice(0, 10),
  matched_skills: "",
  gaps_risks: "",
  pipeline: "Discovered",
  approved_to_apply: false,
  employment_type: "Full-time",
  source: "Company career page",
  job_url: "",
  career_page: "",
  ats_platform: "",
  cv_version: "",
  cv_status: "Not started",
  cover_letter_status: "Not started",
  salary: "",
  job_description: "",
};

function buildApplicationAnswers(
  job: Job,
  profile: PrivateProfile | null,
  email: string,
  suggestion: ResumeSuggestion | null,
): ApplicationAnswer[] {
  const matchedSkills = job.tags.slice(0, 8);
  const fitAnswer = [
    "I am completing a BSc in Computer Science / Cybersecurity & Forensics at Murdoch University on 31 August 2026.",
    matchedSkills.length
      ? `My verified project experience aligns with this role through ${matchedSkills.join(", ")}.`
      : "My verified project work covers software development, APIs, testing, databases, CI/CD, and secure cloud or serverless design.",
    `I am interested in the ${job.role} opportunity at ${job.company} and am available from ${formatLongDate(profile?.available_from)}.`,
  ].join(" ");

  return [
    { id: "legal-name", category: "Identity", label: "Legal name", value: profile?.full_name || "", ready: Boolean(profile?.full_name) },
    { id: "preferred-name", category: "Identity", label: "Preferred name", value: profile?.preferred_name || "", ready: Boolean(profile?.preferred_name) },
    { id: "email", category: "Identity", label: "Email address", value: email, ready: Boolean(email) },
    { id: "phone", category: "Manual check", label: "Phone number", value: "Add your current phone number in the employer form", ready: false, note: "No verified phone number is stored." },
    { id: "dob", category: "Identity", label: "Date of birth", value: formatLongDate(profile?.date_of_birth), ready: Boolean(profile?.date_of_birth) },
    { id: "nationality", category: "Identity", label: "Nationality", value: profile?.nationality || "", ready: Boolean(profile?.nationality) },
    { id: "location", category: "Identity", label: "Current location", value: profile?.location || "", ready: Boolean(profile?.location) },
    { id: "work-status", category: "Eligibility", label: "Current Singapore status", value: profile?.current_pass ? `${profile.current_pass}, expiring ${formatLongDate(profile.pass_expiry)}` : "", ready: Boolean(profile?.current_pass && profile?.pass_expiry) },
    { id: "sponsorship", category: "Eligibility", label: "Visa sponsorship required", value: profile?.sponsorship_required ? "Yes. Employer visa sponsorship is required for Singapore employment." : "No", ready: profile !== null },
    { id: "availability", category: "Eligibility", label: "Earliest start date", value: formatLongDate(profile?.available_from), ready: Boolean(profile?.available_from) },
    { id: "employment", category: "Eligibility", label: "Current employment", value: "Not employed", ready: true },
    { id: "notice", category: "Eligibility", label: "Notice period", value: "None", ready: true },
    { id: "languages", category: "Eligibility", label: "Languages", value: profile?.languages.join(", ") || "", ready: Boolean(profile?.languages.length), note: "Do not claim Mandarin proficiency." },
    { id: "position", category: "Role-specific", label: "Position applied for", value: job.role, ready: true },
    { id: "company", category: "Role-specific", label: "Employer", value: job.company, ready: true },
    { id: "job-location", category: "Role-specific", label: "Job location", value: job.location, ready: true },
    { id: "resume", category: "Role-specific", label: "Recommended resume", value: suggestion ? `${suggestion.name} (${suggestion.code})` : "Select a resume", ready: Boolean(suggestion) },
    { id: "fit", category: "Role-specific", label: "Why are you suitable?", value: fitAnswer, ready: true, note: "Review wording before pasting into a long-answer field." },
    { id: "salary", category: "Manual check", label: "Expected salary", value: "Check the employer sector and application date against the current MOM S Pass table before answering.", ready: false, note: "The correct minimum differs for financial services and changes from 1 January 2027." },
    { id: "declarations", category: "Manual check", label: "Declarations and consent", value: "Answer personally in the employer form", ready: false, note: "Never pre-accept legal declarations." },
  ];
}

function initials(company: string) {
  return company
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "JB";
}

function relativeFound(date: string | null) {
  if (!date) return "Recently";
  const today = new Date();
  const value = new Date(`${date}T00:00:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((start.getTime() - value.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short" }).format(value);
}

function feedDateLabel(date: string | null) {
  if (!date) return "Date not recorded";
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function BrandLogo({ priority = false }: { priority?: boolean }) {
  return (
    <span className="brand-mark" aria-hidden="true">
      <Image src="/brian-logo.png" alt="" width={160} height={160} priority={priority} />
    </span>
  );
}

function mapJob(row: JobRow): Job {
  const normalized = row.match_level.toLowerCase();
  const match: Job["match"] = normalized.includes("strong")
    ? "Strong"
    : normalized.includes("block")
      ? "Blocked"
      : "Review";
  return {
    id: Number(row.id),
    company: row.company,
    initials: initials(row.company),
    role: row.position,
    track: row.role_track,
    score: row.match_score,
    match,
    sponsorship: row.sponsorship,
    location: row.location,
    mode: row.work_mode,
    found: relativeFound(row.date_found),
    tags: row.matched_skills ?? [],
    note: row.gaps_risks || "Review the full role and confirm sponsorship before applying.",
    tone: match === "Blocked" ? "amber" : row.role_track.toLowerCase().includes("cloud") ? "cyan" : "violet",
    pipeline: row.pipeline,
    approved: row.approved_to_apply,
    notionUrl: row.notion_url,
    jobUrl: row.job_url,
    dateFound: row.date_found,
    employmentType: row.employment_type,
    source: row.source,
    careerPage: row.career_page,
    atsPlatform: row.ats_platform,
    cvVersion: row.cv_version,
    cvStatus: row.cv_status,
    coverLetterStatus: row.cover_letter_status,
    salary: row.salary,
    jobDescription: row.job_description,
  };
}

function suggestResume(job: Job, resumes: Resume[]): ResumeSuggestion {
  const text = `${job.role} ${job.track} ${job.tags.join(" ")} ${job.jobDescription || ""}`.toLowerCase();
  const keywordHits = (patterns: RegExp[]) => patterns.reduce((total, pattern) => total + (pattern.test(text) ? 1 : 0), 0);
  const software = keywordHits([/software|developer|engineer|full.?stack|backend|frontend/, /typescript|javascript|react|next\.?js/, /python|fastapi|c\+\+|java/, /api|postgres|sql|database/]);
  const security = keywordHits([/security|cyber|soc|vulnerab|penetration/, /incident|detection|forensic|mitre|splunk/, /appsec|devsecops|secure coding|authentication/, /governance|risk|compliance|pdpa/]);
  const cloud = keywordHits([/cloud|devops|infrastructure/, /aws|azure|gcp|linux|network/]);

  const candidates = [
    { code: "DEV", score: 45 + software * 12 + Math.min(8, cloud * 3) },
    { code: "S+D", score: 44 + software * 8 + security * 8 + cloud * 4 },
    { code: "SEC", score: 44 + security * 12 + Math.min(8, cloud * 3) },
  ].map((candidate) => ({ ...candidate, score: Math.min(96, candidate.score) }));
  if (job.match === "Blocked") candidates.forEach((candidate) => { candidate.score = Math.min(candidate.score, 48); });
  const best = candidates.sort((left, right) => right.score - left.score)[0];
  const resume = resumes.find((item) => item.code === best.code);
  const color = best.score >= 80 ? "green" : best.score >= 60 ? "yellow" : "red";
  return {
    code: best.code,
    name: resume?.name || best.code,
    score: best.score,
    color,
    label: color === "green" ? "Ready to submit" : color === "yellow" ? "Usable with small edits" : "Generate a new version",
    guidance: color === "green"
      ? "This baseline already aligns well. Tailoring is optional."
      : color === "yellow"
        ? "You can submit this baseline, but a few targeted edits should improve relevance."
        : "Do not use the baseline unchanged. Generate a tailored version first.",
  };
}

function formatLongDate(value?: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Singapore",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00+08:00`));
}

function formatScheduleTime(value?: string) {
  const [hour = 8, minute = 0] = (value || "08:00").split(":").map(Number);
  const date = new Date(2026, 0, 1, hour, minute);
  return new Intl.DateTimeFormat("en-SG", { hour: "numeric", minute: "2-digit" }).format(date);
}

const SESSION_ACTIVITY_KEY = "brian-job-command-center:last-activity";
const TEXT_SIZE_KEY = "brian-job-command-center:text-size";
type TextSize = "standard" | "comfortable" | "large";
const TEXT_SIZE_OPTIONS: Array<{ value: TextSize; label: string }> = [
  { value: "standard", label: "Standard" },
  { value: "comfortable", label: "Comfortable" },
  { value: "large", label: "Large" },
];
const SESSION_TIMEOUT_OPTIONS = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 480, label: "8 hours" },
];

type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    theme: "dark";
    size: "flexible" | "compact";
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }) => string;
  remove: (widgetId: string) => void;
};

function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let widgetId = "";
    let renderedSize: "flexible" | "compact" | "" = "";
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    const getApi = () => (window as typeof window & { turnstile?: TurnstileApi }).turnstile;
    const renderWidget = () => {
      const api = getApi();
      const container = containerRef.current;
      if (cancelled || !api || !container) return;
      const nextSize = container.clientWidth < 300 ? "compact" : "flexible";
      if (widgetId && renderedSize === nextSize) return;
      if (widgetId) api.remove(widgetId);
      renderedSize = nextSize;
      widgetId = api.render(container, {
        sitekey: siteKey,
        theme: "dark",
        size: nextSize,
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    };

    if (containerRef.current && "ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(renderWidget);
      resizeObserver.observe(containerRef.current);
    }

    const existingScript = document.getElementById("cloudflare-turnstile-script") as HTMLScriptElement | null;
    if (getApi()) renderWidget();
    else if (existingScript) existingScript.addEventListener("load", renderWidget, { once: true });
    else {
      const script = document.createElement("script");
      script.id = "cloudflare-turnstile-script";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.nonce = document.body.dataset.cspNonce ?? "";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", renderWidget, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      existingScript?.removeEventListener("load", renderWidget);
      const api = getApi();
      if (api && widgetId) api.remove(widgetId);
    };
  }, [onToken, siteKey]);

  return <div className="turnstile-widget" ref={containerRef} aria-label="Cloudflare security verification" />;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const passkeySupported = typeof window !== "undefined" && "PublicKeyCredential" in window;

  const receiveCaptchaToken = useCallback((token: string) => setCaptchaToken(token), []);
  const resetCaptcha = () => {
    setCaptchaToken("");
    setCaptchaResetKey((value) => value + 1);
  };

  useEffect(() => {
    let active = true;
    void supabase.functions.invoke("auth-public-config", { body: {} }).then(({ data, error: configError }) => {
      if (!active) return;
      if (configError || typeof data?.turnstileSiteKey !== "string") {
        setTurnstileError("Cloudflare verification could not be loaded. Refresh the page and try again.");
        return;
      }
      setTurnstileSiteKey(data.turnstileSiteKey);
    });
    return () => { active = false; };
  }, []);

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!email.trim()) {
      setError("Enter your administrator email address.");
      return;
    }
    if (!captchaToken) {
      setError("Complete the Cloudflare verification before signing in.");
      return;
    }

    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
      options: { captchaToken },
    });
    if (signInError) {
      setError(signInError.message);
      resetCaptcha();
    } else {
      window.localStorage.setItem(SESSION_ACTIVITY_KEY, String(Date.now()));
      onAuthenticated();
    }
    setBusy(false);
  };

  const resetPassword = async () => {
    setError("");
    setMessage("");
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    if (!captchaToken) {
      setError("Complete the Cloudflare verification before requesting a reset.");
      return;
    }
    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin,
      captchaToken,
    });
    if (resetError) setError(resetError.message);
    else setMessage("Password reset instructions were sent if this email belongs to the administrator account.");
    resetCaptcha();
    setBusy(false);
  };

  const signInWithPasskey = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    if (!captchaToken) {
      setError("Complete the Cloudflare verification before using a passkey.");
      setBusy(false);
      return;
    }
    const { error: passkeyError } = await supabase.auth.signInWithPasskey({ options: { captchaToken } });
    if (passkeyError) {
      setError(passkeyError.message);
      resetCaptcha();
    } else {
      window.localStorage.setItem(SESSION_ACTIVITY_KEY, String(Date.now()));
      onAuthenticated();
    }
    setBusy(false);
  };

  return (
    <main className="auth-shell">
      <div className="auth-aurora auth-aurora-one" /><div className="auth-aurora auth-aurora-two" />
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><BrandLogo priority /><div><strong>BRIAN</strong><small>Job Command Center</small></div></div>
        <div className="auth-lock">Private admin portal</div>
        <p className="eyebrow">Supabase protected</p>
        <h1 id="auth-title">Welcome back.</h1>
        <p className="auth-copy">Enter the administrator account credentials to open the private dashboard.</p>

        <form className="auth-form" onSubmit={submitPassword}>
          <label><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required /></label>
          <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Enter your private password" required /></label>
          <div className="turnstile-panel">
            <div className="turnstile-heading"><span>Cloudflare security check</span><strong>{captchaToken ? "Verified" : "Required"}</strong></div>
            {turnstileSiteKey ? <TurnstileWidget key={captchaResetKey} siteKey={turnstileSiteKey} onToken={receiveCaptchaToken} /> : <div className="turnstile-loading">Loading secure verification...</div>}
            {turnstileError ? <p className="turnstile-error" role="alert">{turnstileError}</p> : null}
          </div>
          {error ? <p className="auth-message error" role="alert">{error}</p> : null}
          {message ? <p className="auth-message success" role="status">{message}</p> : null}
          <button className="primary-button auth-primary" disabled={busy || !captchaToken}>{busy ? "Please wait" : "Sign in securely"}</button>
        </form>

        <div className="auth-divider"><span>or</span></div>
        <button className="passkey-button" onClick={signInWithPasskey} disabled={busy || !passkeySupported || !captchaToken}><span>◎</span> Sign in with a passkey</button>
        {!passkeySupported ? <p className="auth-hint">This browser does not support passkeys.</p> : <p className="auth-hint">Passkey sign-in works after you register one from Security and connections.</p>}

        <button className="auth-mode" onClick={resetPassword} disabled={busy || !captchaToken}>Forgot password?</button>
        <div className="auth-trust"><span>Encrypted database</span><span>Row-level security</span><span>Independent login</span></div>
      </section>
    </main>
  );
}

const navItems = ["Overview", "Pipeline", "Resumes", "Profile"];

function DashboardIcon({ name }: { name: "clock" | "sparkles" | "queue" | "blocked" | "records" }) {
  const paths = {
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5l3.25 2" /></>,
    sparkles: <><path d="m12 3 1.3 4.1L17.5 8.5l-4.2 1.4L12 14l-1.3-4.1-4.2-1.4 4.2-1.4L12 3Z" /><path d="m18.5 14 .7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z" /></>,
    queue: <><rect x="4" y="5" width="16" height="14" rx="2.5" /><path d="M8 9h8M8 13h6" /></>,
    blocked: <><path d="M12 3.5 20 18H4L12 3.5Z" /><path d="M12 8.5v4M12 15.5h.01" /></>,
    records: <><path d="M20 12a8 8 0 1 1-2.35-5.65" /><path d="M20 4v5h-5" /></>,
  };

  return <svg className="dashboard-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

function JobCard({
  job,
  saved,
  onSave,
  onOpen,
  onDecision,
  decisionBusy,
}: {
  job: Job;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
  onDecision: (decision: "Accepted" | "Applied" | "Rejected") => void;
  decisionBusy: boolean;
}) {
  return (
    <article
      className="job-card"
      role="button"
      tabIndex={0}
      aria-label={`Review details for ${job.role} at ${job.company}`}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button, a, input, select, textarea")) return;
        onOpen();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onOpen();
      }}
    >
      <div className={`company-mark ${job.tone}`}>{job.initials}</div>
      <div className="job-main">
        <div className="job-heading">
          <div>
            <div className="company-line">
              <span>{job.company}</span><span className="dot">•</span><span>{job.found}</span>
            </div>
            <h3>{job.role}</h3>
          </div>
          <button
            className={`save-button ${saved ? "saved" : ""}`}
            onClick={onSave}
            aria-label={saved ? "Remove from saved" : "Save job"}
          >
            {saved ? "★" : "☆"}
          </button>
        </div>
        <div className="job-meta">
          <span>{job.location}</span><span>{job.mode}</span><span>{job.track}</span>
        </div>
        <div className="tag-row">
          {job.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
        </div>
        <div className="decision-actions" aria-label={`Decision for ${job.role}`}>
          <button type="button" className={job.pipeline === "Accepted" ? "accepted active" : "accepted"} onClick={() => onDecision("Accepted")} disabled={decisionBusy}>✓ Accept</button>
          <button type="button" className={job.pipeline === "Applied" ? "applied active" : "applied"} onClick={() => onDecision("Applied")} disabled={decisionBusy}>↗ Applied</button>
          <button type="button" className={job.pipeline === "Rejected" ? "rejected active" : "rejected"} onClick={() => onDecision("Rejected")} disabled={decisionBusy}>× Reject</button>
        </div>
        <div className="job-footer">
          <div className="status-group">
            <span className={`match-pill ${job.match.toLowerCase()}`}>{job.match}</span>
            <span className={`pipeline-pill ${job.pipeline.toLowerCase().replaceAll(" ", "-")}`}>{job.pipeline}</span>
            <span className="sponsor-pill unknown">Sponsorship {job.sponsorship.toLowerCase()}</span>
          </div>
          <button className="text-button" onClick={onOpen}>Review details <span aria-hidden="true">↗</span></button>
        </div>
      </div>
      <div
        className={`score-ring score-${job.match.toLowerCase()}`}
        aria-label={`${job.score} percent match`}
      >
        <svg className="score-ring-progress" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <circle className="score-ring-track" cx="32" cy="32" r="28" pathLength="100" />
          <circle className="score-ring-value" cx="32" cy="32" r="28" pathLength="100" strokeDasharray={`${Math.max(0, Math.min(100, job.score))} 100`} />
        </svg>
        <strong>{job.score}</strong><span>match</span>
      </div>
    </article>
  );
}

export default function Home() {
  const [authPhase, setAuthPhase] = useState<"checking" | "signed_out" | "authorized" | "denied">("checking");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [profile, setProfile] = useState<PrivateProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dataError, setDataError] = useState("");
  const [dataLoading, setDataLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [jobSort, setJobSort] = useState<"newest" | "oldest">("newest");
  const [feedDate, setFeedDate] = useState("all");
  const [pipelineFilter, setPipelineFilter] = useState("Active");
  const [visibleJobCount, setVisibleJobCount] = useState(JOBS_PER_PAGE);
  const [dark, setDark] = useState(true);
  const [textSize, setTextSize] = useState<TextSize>("comfortable");
  const [saved, setSaved] = useState<number[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [revealProfile, setRevealProfile] = useState(false);
  const [salaryEra, setSalaryEra] = useState<"2026" | "2027">("2026");
  const [financialSector, setFinancialSector] = useState(false);
  const [copied, setCopied] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notionToken, setNotionToken] = useState("");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(60);
  const [sessionMessage, setSessionMessage] = useState("");
  const [discoveryEnabled, setDiscoveryEnabled] = useState(true);
  const [discoveryTime, setDiscoveryTime] = useState("08:00");
  const [discoveryTimezone, setDiscoveryTimezone] = useState("Asia/Singapore");
  const [discoverySources, setDiscoverySources] = useState("");
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [webSearchConfigured, setWebSearchConfigured] = useState(false);
  const [webSearchQueries, setWebSearchQueries] = useState(DEFAULT_DISCOVERY_QUERIES.join("\n"));
  const [targetRoleKeywords, setTargetRoleKeywords] = useState("");
  const [excludedTitleKeywords, setExcludedTitleKeywords] = useState("");
  const [webSearchKey, setWebSearchKey] = useState("");
  const [exaSearchKey, setExaSearchKey] = useState("");
  const [firecrawlSearchKey, setFirecrawlSearchKey] = useState("");
  const [braveSearchKey, setBraveSearchKey] = useState("");
  const [serpApiSearchKey, setSerpApiSearchKey] = useState("");
  const [serperSearchKey, setSerperSearchKey] = useState("");
  const [maxRequiredYears, setMaxRequiredYears] = useState(1);
  const [discoveryLocation, setDiscoveryLocation] = useState("Singapore");
  const [discoveryCountry, setDiscoveryCountry] = useState("singapore");
  const [sourceLearningEnabled, setSourceLearningEnabled] = useState(true);
  const [decisionBusyId, setDecisionBusyId] = useState<number | null>(null);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [scoutToggleBusy, setScoutToggleBusy] = useState(false);
  const [discoveryMessage, setDiscoveryMessage] = useState("");
  const [documentProvider, setDocumentProvider] = useState<"gemini" | "openai_compatible">("gemini");
  const [documentModel, setDocumentModel] = useState("gemini-3.6-flash");
  const [documentEndpoint, setDocumentEndpoint] = useState("");
  const [documentKey, setDocumentKey] = useState("");
  const [documentProviderBusy, setDocumentProviderBusy] = useState(false);
  const [documentProviderMessage, setDocumentProviderMessage] = useState("");
  const [generatedDocuments, setGeneratedDocuments] = useState<GeneratedDocument[]>([]);
  const [documentResumeCode, setDocumentResumeCode] = useState("DEV");
  const [documentConsent, setDocumentConsent] = useState(false);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentMessage, setDocumentMessage] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [copiedApplicationField, setCopiedApplicationField] = useState("");
  const [passkeys, setPasskeys] = useState<Array<{ id: string; friendly_name?: string; created_at: string }>>([]);
  const [jobEditorOpen, setJobEditorOpen] = useState(false);
  const [jobDraft, setJobDraft] = useState<JobDraft>(EMPTY_JOB);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<PrivateProfile | null>(null);
  const [resumeEditorOpen, setResumeEditorOpen] = useState(false);
  const [resumeDraft, setResumeDraft] = useState<Resume | null>(null);
  const [resumeFiles, setResumeFiles] = useState<File[]>([]);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorMessage, setEditorMessage] = useState("");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const searchRef = useRef<HTMLInputElement>(null);

  const loadDashboard = useCallback(async () => {
    setDataLoading(true);
    setDataError("");
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setAuthPhase("signed_out");
      setDataLoading(false);
      return;
    }
    const { data: isAdmin, error: adminError } = await supabase.rpc("is_current_admin");
    if (adminError || isAdmin !== true) {
      setAuthPhase("denied");
      setDataLoading(false);
      return;
    }

    setCurrentUserEmail(userData.user.email || "");
    setAccountEmail(userData.user.email || "");

    const [jobsResult, resumesResult, profileResult, settingsResult] = await Promise.all([
      supabase.from("jobs").select("*").order("match_score", { ascending: false }).order("date_found", { ascending: false }),
      supabase.from("resumes").select("*, resume_files(*)").order("sort_order", { ascending: true }),
      supabase.from("private_profile").select("*").eq("id", 1).single(),
      supabase.from("app_settings").select("*").eq("id", 1).single(),
    ]);

    const firstError = jobsResult.error || resumesResult.error || profileResult.error || settingsResult.error;
    if (firstError) {
      setDataError(firstError.message);
    } else {
      const rows = (jobsResult.data ?? []) as JobRow[];
      setJobs(rows.map(mapJob));
      setVisibleJobCount(JOBS_PER_PAGE);
      setSaved(rows.filter((job) => job.saved).map((job) => Number(job.id)));
      setResumes((resumesResult.data ?? []) as Resume[]);
      setProfile(profileResult.data as PrivateProfile);
      const nextSettings = settingsResult.data as AppSettings;
      setSettings(nextSettings);
      setDiscoveryEnabled(nextSettings.discovery_enabled ?? true);
      setDiscoveryTime((nextSettings.discovery_time || "08:00").slice(0, 5));
      setDiscoveryTimezone(nextSettings.discovery_timezone || "Asia/Singapore");
      setDiscoverySources((nextSettings.discovery_source_urls ?? []).join("\n"));
      setWebSearchEnabled(nextSettings.discovery_web_search_enabled ?? true);
      setWebSearchConfigured(nextSettings.discovery_web_search_configured ?? false);
      setWebSearchQueries((nextSettings.discovery_search_queries?.length ? nextSettings.discovery_search_queries : DEFAULT_DISCOVERY_QUERIES).join("\n"));
      setTargetRoleKeywords((nextSettings.discovery_target_role_keywords ?? []).join("\n"));
      setExcludedTitleKeywords((nextSettings.discovery_excluded_title_keywords ?? []).join("\n"));
      setMaxRequiredYears(nextSettings.discovery_max_required_years ?? 1);
      setDiscoveryLocation(nextSettings.discovery_location || "Singapore");
      setDiscoveryCountry(nextSettings.discovery_country || "singapore");
      setSourceLearningEnabled(nextSettings.discovery_source_learning_enabled ?? true);
      setDocumentProvider(nextSettings.document_provider || "gemini");
      setDocumentModel(nextSettings.document_model || "gemini-3.6-flash");
      setDocumentEndpoint(nextSettings.document_endpoint || "");
      setSessionTimeoutMinutes(nextSettings.session_timeout_minutes || 60);
    }
    setAuthPhase("authorized");
    setDataLoading(false);
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadDashboard(), 0);
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => void loadDashboard(), 0);
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") setSelectedJob(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(initialLoad);
      authListener.subscription.unsubscribe();
      window.removeEventListener("keydown", onKey);
    };
  }, [loadDashboard]);

  useEffect(() => {
    const clock = window.setInterval(() => setCurrentDate(new Date()), 1_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedTextSize = window.localStorage.getItem(TEXT_SIZE_KEY);
      if (TEXT_SIZE_OPTIONS.some((option) => option.value === savedTextSize)) {
        setTextSize(savedTextSize as TextSize);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const changeTextSize = (nextTextSize: TextSize) => {
    setTextSize(nextTextSize);
    window.localStorage.setItem(TEXT_SIZE_KEY, nextTextSize);
  };

  useEffect(() => {
    if (authPhase !== "authorized") return;

    let timeoutId = 0;
    let lastWrite = 0;
    const timeoutMs = sessionTimeoutMinutes * 60_000;
    const expireSession = async () => {
      window.localStorage.removeItem(SESSION_ACTIVITY_KEY);
      await supabase.auth.signOut({ scope: "local" });
      setSecurityOpen(false);
      setAuthPhase("signed_out");
    };
    const scheduleExpiry = () => {
      window.clearTimeout(timeoutId);
      const stored = Number(window.localStorage.getItem(SESSION_ACTIVITY_KEY));
      const lastActivity = Number.isFinite(stored) && stored > 0 ? stored : Date.now();
      if (!stored) window.localStorage.setItem(SESSION_ACTIVITY_KEY, String(lastActivity));
      const remaining = timeoutMs - (Date.now() - lastActivity);
      if (remaining <= 0) void expireSession();
      else timeoutId = window.setTimeout(() => void expireSession(), remaining);
    };
    const markActivity = () => {
      const now = Date.now();
      if (now - lastWrite < 1_000) return;
      lastWrite = now;
      window.localStorage.setItem(SESSION_ACTIVITY_KEY, String(now));
      scheduleExpiry();
    };
    const checkVisibility = () => {
      if (document.visibilityState === "visible") scheduleExpiry();
    };

    scheduleExpiry();
    window.addEventListener("pointerdown", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    window.addEventListener("touchstart", markActivity, { passive: true });
    document.addEventListener("visibilitychange", checkVisibility);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("touchstart", markActivity);
      document.removeEventListener("visibilitychange", checkVisibility);
    };
  }, [authPhase, sessionTimeoutMinutes]);

  useEffect(() => {
    if (!selectedJob) return;
    const loadDocuments = async () => {
      const { data, error } = await supabase.from("generated_documents")
        .select("*")
        .eq("job_id", selectedJob.id)
        .order("created_at", { ascending: false });
      if (error) setDocumentMessage(error.message);
      else setGeneratedDocuments((data ?? []) as GeneratedDocument[]);
    };
    void loadDocuments();
  }, [selectedJob]);

  const availableFeedDates = useMemo(() => [...new Set(jobs
    .map((job) => job.dateFound)
    .filter((date): date is string => Boolean(date)))]
    .sort((first, second) => second.localeCompare(first)), [jobs]);

  const filteredJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return jobs
      .filter((job) => {
        const matchesFilter = filter === "All" || job.match === filter;
        const matchesDate = feedDate === "all" || job.dateFound === feedDate;
        const matchesPipeline = pipelineFilter === "All statuses"
          || pipelineFilter === "Active" && !["Rejected", "Blocked"].includes(job.pipeline)
          || job.pipeline === pipelineFilter;
        const haystack = `${job.company} ${job.role} ${job.track} ${job.tags.join(" ")}`.toLowerCase();
        return matchesFilter && matchesDate && matchesPipeline && (!normalized || haystack.includes(normalized));
      })
      .sort((first, second) => {
        const firstDate = first.dateFound ? new Date(`${first.dateFound}T00:00:00`).getTime() : null;
        const secondDate = second.dateFound ? new Date(`${second.dateFound}T00:00:00`).getTime() : null;
        if (firstDate === null && secondDate === null) return second.score - first.score || second.id - first.id;
        if (firstDate === null) return 1;
        if (secondDate === null) return -1;
        const dateDifference = jobSort === "newest" ? secondDate - firstDate : firstDate - secondDate;
        return dateDifference || second.score - first.score || second.id - first.id;
      });
  }, [feedDate, filter, pipelineFilter, query, jobs, jobSort]);

  const visibleJobs = filteredJobs.slice(0, visibleJobCount);
  const groupedVisibleJobs = useMemo(() => {
    const groups = new Map<string, Job[]>();
    for (const job of visibleJobs) {
      const key = job.dateFound || "undated";
      groups.set(key, [...(groups.get(key) || []), job]);
    }
    return [...groups.entries()];
  }, [visibleJobs]);
  const remainingJobCount = Math.max(0, filteredJobs.length - visibleJobs.length);

  const scrollTo = (label: string) => {
    document.getElementById(label.toLowerCase())?.scrollIntoView({ behavior: "smooth" });
  };

  const openJobDetails = (job: Job) => {
    const suggestion = suggestResume(job, resumes);
    setDocumentResumeCode(suggestion.code);
    setGeneratedDocuments([]);
    setDocumentConsent(false);
    setDocumentMessage("");
    setPromptCopied(false);
    setCopiedApplicationField("");
    setSelectedJob(job);
  };

  const toggleSave = async (id: number) => {
    const wasSaved = saved.includes(id);
    setSaved((items) => wasSaved ? items.filter((item) => item !== id) : [...items, id]);
    const { error } = await supabase.from("jobs").update({ saved: !wasSaved }).eq("id", id);
    if (error) {
      setSaved((items) => wasSaved ? [...items, id] : items.filter((item) => item !== id));
      setDataError(error.message);
    }
  };

  const setJobDecision = async (job: Job, decision: "Accepted" | "Applied" | "Rejected") => {
    if (decisionBusyId !== null) return;
    const previousJobs = jobs;
    const previousSelectedJob = selectedJob;
    const approved = decision !== "Rejected";
    const updatedJob = { ...job, pipeline: decision, approved };

    setDecisionBusyId(job.id);
    setDataError("");
    setJobs((items) => items.map((item) => item.id === job.id ? updatedJob : item));
    setSelectedJob((current) => current?.id === job.id ? updatedJob : current);

    const { error } = await supabase.from("jobs").update({
      pipeline: decision,
      approved_to_apply: approved,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    if (error) {
      setJobs(previousJobs);
      setSelectedJob(previousSelectedJob);
      setDataError(`Could not label this job: ${error.message}`);
    }
    setDecisionBusyId(null);
  };

  const salary = salaryEra === "2026"
    ? financialSector ? 3800 : 3300
    : financialSector ? 4000 : 3600;

  const copySalary = async () => {
    await navigator.clipboard.writeText(`S$${salary.toLocaleString()} fixed monthly salary`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const copyApplicationValue = async (answer: ApplicationAnswer) => {
    if (!answer.ready) return;
    await navigator.clipboard.writeText(answer.value);
    setCopiedApplicationField(answer.id);
    window.setTimeout(() => setCopiedApplicationField((current) => current === answer.id ? "" : current), 1600);
  };

  const copyApplicationPack = async (answers: ApplicationAnswer[]) => {
    const ready = answers.filter((answer) => answer.ready && answer.value);
    const manual = answers.filter((answer) => !answer.ready);
    const pack = [
      "APPLICATION COPY PACK",
      ...ready.map((answer) => `${answer.label}: ${answer.value}`),
      "",
      "CHECK MANUALLY",
      ...manual.map((answer) => `${answer.label}: ${answer.value}`),
    ].join("\n");
    await navigator.clipboard.writeText(pack);
    setCopiedApplicationField("all");
    window.setTimeout(() => setCopiedApplicationField((current) => current === "all" ? "" : current), 1600);
  };

  const openJobWithApplicationPack = (job: Job, answers: ApplicationAnswer[]) => {
    if (!job.jobUrl) return;
    window.open(job.jobUrl, "_blank", "noopener,noreferrer");
    void copyApplicationPack(answers);
  };

  const refreshPasskeys = async () => {
    const { data, error } = await supabase.auth.passkey.list();
    if (error) setConnectionMessage(error.message);
    else setPasskeys((data ?? []) as Array<{ id: string; friendly_name?: string; created_at: string }>);
  };

  const openSecurity = async () => {
    setSecurityOpen(true);
    setConnectionMessage("");
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email || "";
    setCurrentUserEmail(email);
    setAccountEmail(email);
    await refreshPasskeys();
  };

  const updateEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = accountEmail.trim().toLowerCase();
    if (!normalized || normalized === currentUserEmail.toLowerCase()) {
      setConnectionMessage("Enter a different valid email address.");
      return;
    }
    setSecurityBusy(true);
    setConnectionMessage("");
    const { error } = await supabase.auth.updateUser(
      { email: normalized },
      { emailRedirectTo: window.location.origin },
    );
    if (error) setConnectionMessage(error.message);
    else setConnectionMessage("Email change requested. Confirm the messages sent by Supabase, then sign in with the new address.");
    setSecurityBusy(false);
  };

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword.length < 12) {
      setConnectionMessage("Use at least 12 characters for the new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setConnectionMessage("The new passwords do not match.");
      return;
    }
    setSecurityBusy(true);
    setConnectionMessage("");
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      current_password: currentPassword,
    });
    if (error) setConnectionMessage(error.message);
    else {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setConnectionMessage("Password updated successfully.");
    }
    setSecurityBusy(false);
  };

  const saveSessionTimeout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSecurityBusy(true);
    setSessionMessage("");
    const { error } = await supabase.from("app_settings").update({
      session_timeout_minutes: sessionTimeoutMinutes,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (error) setSessionMessage(error.message);
    else {
      window.localStorage.setItem(SESSION_ACTIVITY_KEY, String(Date.now()));
      setSessionMessage(`Session timeout saved as ${SESSION_TIMEOUT_OPTIONS.find((option) => option.value === sessionTimeoutMinutes)?.label || `${sessionTimeoutMinutes} minutes`}.`);
      setSettings((current) => current ? { ...current, session_timeout_minutes: sessionTimeoutMinutes } : current);
    }
    setSecurityBusy(false);
  };

  const registerPasskey = async () => {
    setSecurityBusy(true);
    setConnectionMessage("");
    const { error } = await supabase.auth.registerPasskey();
    if (error) setConnectionMessage(error.message);
    else {
      setConnectionMessage("Passkey registered. You can use it from the sign-in screen.");
      await refreshPasskeys();
    }
    setSecurityBusy(false);
  };

  const deletePasskey = async (id: string) => {
    setSecurityBusy(true);
    const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
    if (error) setConnectionMessage(error.message);
    else {
      setConnectionMessage("Passkey removed.");
      await refreshPasskeys();
    }
    setSecurityBusy(false);
  };

  const backupToNotion = async () => {
    setSecurityBusy(true);
    setConnectionMessage("Backing up Supabase records to Notion...");
    const { data, error } = await supabase.functions.invoke("sync-notion", { body: { action: "backup" } });
    if (error) setConnectionMessage(error.message);
    else {
      const count = typeof data?.backed_up === "number" ? data.backed_up : 0;
      setConnectionMessage(`${count} Supabase records backed up to Notion.`);
      await loadDashboard();
    }
    setSecurityBusy(false);
  };

  const connectNotion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (notionToken.trim().length < 20) {
      setConnectionMessage("Enter a valid Notion integration token.");
      return;
    }
    setSecurityBusy(true);
    setConnectionMessage("");
    const { error } = await supabase.functions.invoke("sync-notion", {
      body: { action: "connect", token: notionToken.trim() },
    });
    setNotionToken("");
    if (error) {
      setConnectionMessage(error.message);
      setSecurityBusy(false);
      return;
    }
    setConnectionMessage("Notion backup connection saved securely. Starting the first backup...");
    setSecurityBusy(false);
    await backupToNotion();
  };

  const normalizedDiscoverySources = () => discoverySources
    .split(/\r?\n/)
    .map((source) => source.trim())
    .filter(Boolean);

  const normalizedWebSearchQueries = () => webSearchQueries
    .split(/\r?\n/)
    .map((searchQuery) => searchQuery.trim())
    .filter(Boolean)
    .slice(0, 8);

  const normalizedCriteriaLines = (value: string, limit = 80) => [...new Set(value
    .split(/\r?\n|,/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean))].slice(0, limit);

  const discoveryStateCopy = (enabled: boolean, sourceTotal: number, webReady = webSearchEnabled && webSearchConfigured) => ({
    status: enabled ? sourceTotal || webReady ? "Scheduled" : "Waiting for sources" : "Paused",
    message: enabled
      ? sourceTotal || webReady ? `Daily discovery for ${discoveryLocation.trim() || "the selected location"} is configured for ${formatScheduleTime(discoveryTime)}.` : "Add a direct company feed or configure Tavily web discovery."
      : "Automatic discovery is paused.",
  });

  const toggleDiscoveryAutomation = async () => {
    if (scoutToggleBusy) return;
    const previousEnabled = discoveryEnabled;
    const nextEnabled = !previousEnabled;
    const stateCopy = discoveryStateCopy(nextEnabled, normalizedDiscoverySources().length);

    setScoutToggleBusy(true);
    setDataError("");
    setDiscoveryEnabled(nextEnabled);

    const { data, error } = await supabase.from("app_settings").update({
      discovery_enabled: nextEnabled,
      discovery_status: stateCopy.status,
      discovery_message: stateCopy.message,
      updated_at: new Date().toISOString(),
    }).eq("id", 1).select("discovery_enabled, discovery_status, discovery_message").single();

    if (error) {
      setDiscoveryEnabled(previousEnabled);
      setDataError(`Could not ${nextEnabled ? "resume" : "pause"} Job Match Scout: ${error.message}`);
    } else {
      setSettings((current) => current ? {
        ...current,
        discovery_enabled: data.discovery_enabled,
        discovery_status: data.discovery_status,
        discovery_message: data.discovery_message,
      } : current);
      setDiscoveryMessage(nextEnabled ? "Automatic job discovery resumed." : "Automatic job discovery paused. Manual fetch remains available.");
    }
    setScoutToggleBusy(false);
  };

  const persistDiscoverySettings = async () => {
    const sources = normalizedDiscoverySources();
    const unsupported = sources.find((source) => {
      try {
        const host = new URL(source).hostname;
        return !["boards.greenhouse.io", "job-boards.greenhouse.io", "boards.eu.greenhouse.io", "jobs.lever.co"].includes(host);
      } catch {
        return true;
      }
    });
    if (unsupported) {
      setDiscoveryMessage(`Unsupported direct board: ${unsupported}. Direct feeds accept Greenhouse and Lever. Tavily automatically discovers Workday, Ashby, SmartRecruiters, iCIMS, Workable, and independent career sites.`);
      return false;
    }

    const stateCopy = discoveryStateCopy(discoveryEnabled, sources.length);
    const queries = normalizedWebSearchQueries();
    const roleKeywords = normalizedCriteriaLines(targetRoleKeywords);
    const excludedKeywords = normalizedCriteriaLines(excludedTitleKeywords, 40);
    if (webSearchEnabled && !queries.length) {
      setDiscoveryMessage("Add at least one web search query or turn web search off.");
      return false;
    }
    if (discoveryLocation.trim().length < 2) {
      setDiscoveryMessage("Enter the city, region, or country where you want to find jobs.");
      return false;
    }
    if (!roleKeywords.length || !excludedKeywords.length) {
      setDiscoveryMessage("Keep at least one target role keyword and one excluded title keyword.");
      return false;
    }
    const { error } = await supabase.from("app_settings").update({
      discovery_enabled: discoveryEnabled,
      discovery_time: discoveryTime,
      discovery_timezone: discoveryTimezone,
      discovery_source_urls: sources,
      discovery_web_search_enabled: webSearchEnabled,
      discovery_search_queries: queries,
      discovery_target_role_keywords: roleKeywords,
      discovery_excluded_title_keywords: excludedKeywords,
      discovery_max_required_years: maxRequiredYears,
      discovery_location: discoveryLocation.trim(),
      discovery_country: discoveryCountry,
      discovery_source_learning_enabled: sourceLearningEnabled,
      discovery_web_search_provider: "automatic",
      discovery_monthly_credit_cap: 900,
      discovery_status: stateCopy.status,
      discovery_message: stateCopy.message,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (error) {
      setDiscoveryMessage(error.message);
      return false;
    }
    return true;
  };

  const reviewCriteriaSuggestion = async (decision: "approved" | "rejected") => {
    const suggestion = settings?.discovery_criteria_suggestion;
    if (!suggestion || settings?.discovery_criteria_suggestion_status !== "pending") return;
    setDiscoveryBusy(true);
    setDiscoveryMessage("");
    const payload = decision === "approved" ? {
      discovery_search_queries: suggestion.search_queries,
      discovery_target_role_keywords: suggestion.target_role_keywords,
      discovery_excluded_title_keywords: suggestion.excluded_title_keywords,
      discovery_max_required_years: suggestion.max_required_years,
      discovery_criteria_suggestion_status: decision,
      discovery_criteria_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } : {
      discovery_criteria_suggestion_status: decision,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("app_settings").update(payload).eq("id", 1);
    if (error) setDiscoveryMessage(error.message);
    else {
      setDiscoveryMessage(decision === "approved" ? "Resume suggestion approved. Future scans now use the new criteria." : "Resume suggestion dismissed. The active criteria were not changed.");
      await loadDashboard();
    }
    setDiscoveryBusy(false);
  };

  const saveWebSearchKey = async () => {
    const keys = {
      tavily: webSearchKey.trim(),
      exa: exaSearchKey.trim(),
      firecrawl: firecrawlSearchKey.trim(),
      brave: braveSearchKey.trim(),
      serpapi: serpApiSearchKey.trim(),
      serper: serperSearchKey.trim(),
    };
    if (!Object.values(keys).some(Boolean)) {
      setDiscoveryMessage("Paste at least one new or replacement provider key.");
      return;
    }
    if (keys.tavily && !/^tvly-[A-Za-z0-9_-]{16,}$/.test(keys.tavily)) {
      setDiscoveryMessage("Enter a valid Tavily API key beginning with tvly-.");
      return;
    }
    if (keys.firecrawl && !/^fc-[A-Za-z0-9_-]{12,}$/.test(keys.firecrawl)) {
      setDiscoveryMessage("Enter a valid Firecrawl API key beginning with fc-.");
      return;
    }
    if ([keys.exa, keys.serpapi, keys.serper].some((key) => key && key.length < 16) || keys.brave && keys.brave.length < 20) {
      setDiscoveryMessage("One of the provider keys is too short. Copy the complete key from its provider dashboard.");
      return;
    }
    setDiscoveryBusy(true);
    setDiscoveryMessage("");
    const { error } = await supabase.rpc("store_search_provider_keys", {
      tavily_key: keys.tavily || null,
      exa_key: keys.exa || null,
      firecrawl_key: keys.firecrawl || null,
      brave_key: keys.brave || null,
      serpapi_key: keys.serpapi || null,
      serper_key: keys.serper || null,
    });
    if (error) {
      setDiscoveryMessage(error.message);
    } else {
      setWebSearchKey("");
      setExaSearchKey("");
      setFirecrawlSearchKey("");
      setBraveSearchKey("");
      setSerpApiSearchKey("");
      setSerperSearchKey("");
      setWebSearchConfigured(true);
      setWebSearchEnabled(true);
      setDiscoveryMessage("Provider keys saved securely. Automatic failover will use the first available service on every scan.");
      await loadDashboard();
    }
    setDiscoveryBusy(false);
  };

  const testSearchProviders = async () => {
    setDiscoveryBusy(true);
    setDiscoveryMessage("Checking free account endpoints without running any searches...");
    const { data, error } = await supabase.functions.invoke("discover-jobs", { body: { action: "diagnostic" } });
    if (error) {
      setDiscoveryMessage(await edgeErrorMessage(error, "Provider status check failed."));
    } else {
      const checked = Number(data?.checked ?? 0);
      const unavailable = Number(data?.unavailable ?? 0);
      setDiscoveryMessage(`${checked} provider key${checked === 1 ? "" : "s"} checked without consuming search credits. ${unavailable} provider${unavailable === 1 ? "" : "s"} do not offer a zero-credit validation endpoint.`);
      await loadDashboard();
    }
    setDiscoveryBusy(false);
  };

  const saveDiscoverySettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDiscoveryBusy(true);
    setDiscoveryMessage("");
    if (await persistDiscoverySettings()) {
      setDiscoveryMessage("Discovery schedule, search rules, and sources saved.");
      await loadDashboard();
    }
    setDiscoveryBusy(false);
  };

  const fetchJobsNow = async () => {
    setDiscoveryBusy(true);
    setDiscoveryMessage(`Searching direct boards and the wider web for ${discoveryLocation.trim()} roles now...`);
    if (!(await persistDiscoverySettings())) {
      setDiscoveryBusy(false);
      return;
    }
    const { data, error } = await supabase.functions.invoke("discover-jobs", { body: { action: "manual" } });
    if (error) {
      setDiscoveryMessage(error.message);
    } else if (data?.skipped) {
      setDiscoveryMessage(data.reason || "The scan was skipped.");
    } else {
      const usage = data?.tavilyUsage ? ` Tavily used ${data.tavilyUsage.usage} of ${Math.min(data.tavilyUsage.limit, 900)} allowed monthly credits.` : "";
      const provider = data?.webSearchProvider ? ` Web search used ${String(data.webSearchProvider).replace(/^./, (letter: string) => letter.toUpperCase())}.` : "";
      const fallback = Array.isArray(data?.providerAttempts) && data.providerAttempts.length > 1 ? ` Automatic failover skipped ${data.providerAttempts.length - 1} unavailable provider${data.providerAttempts.length === 2 ? "" : "s"}.` : "";
      setDiscoveryMessage(`${data?.inserted ?? 0} new roles added for ${data?.targetLocation || discoveryLocation}. ${data?.duplicates ?? 0} already tracked. ${data?.skipped ?? 0} unsuitable roles skipped.${provider}${fallback}${usage}`);
      await loadDashboard();
    }
    setDiscoveryBusy(false);
  };

  const saveDocumentProvider = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (documentKey.trim().length < 16) {
      setDocumentProviderMessage("Enter a valid provider key. It is sent directly to Supabase Vault after you confirm.");
      return;
    }
    if (!documentModel.trim()) {
      setDocumentProviderMessage("Enter the model name supplied by your provider.");
      return;
    }
    if (documentProvider === "openai_compatible" && !documentEndpoint.trim().startsWith("https://")) {
      setDocumentProviderMessage("Enter the provider's full HTTPS chat-completions endpoint.");
      return;
    }
    if (!window.confirm(`Save this ${documentProvider === "gemini" ? "Gemini" : "custom provider"} key in your encrypted Supabase Vault?`)) return;
    setDocumentProviderBusy(true);
    setDocumentProviderMessage("");
    const { error } = await supabase.rpc("store_document_provider_config", {
      provider_value: documentProvider,
      key_value: documentKey.trim(),
      model_value: documentModel.trim(),
      endpoint_value: documentProvider === "openai_compatible" ? documentEndpoint.trim() : null,
    });
    if (error) setDocumentProviderMessage(error.message);
    else {
      setDocumentKey("");
      setDocumentProviderMessage("Provider saved. The key is encrypted in Supabase Vault and is never shown again.");
      await loadDashboard();
    }
    setDocumentProviderBusy(false);
  };

  const clearDocumentProvider = async () => {
    if (!window.confirm("Remove the saved document provider key from Supabase Vault?")) return;
    setDocumentProviderBusy(true);
    const { error } = await supabase.rpc("clear_document_provider_config");
    setDocumentProviderMessage(error ? error.message : "Provider key removed. External prompt copy still works.");
    if (!error) await loadDashboard();
    setDocumentProviderBusy(false);
  };

  const edgeErrorMessage = async (error: unknown, fallback: string) => {
    if (error && typeof error === "object" && "context" in error) {
      const context = (error as { context?: Response }).context;
      if (context) {
        const body = await context.clone().json().catch(() => null);
        if (body?.error) return String(body.error);
      }
    }
    return error instanceof Error ? error.message : fallback;
  };

  const copyExternalPrompt = async () => {
    if (!selectedJob) return;
    setDocumentBusy(true);
    setDocumentMessage("Preparing the job-specific prompt from your private baseline...");
    const { data, error } = await supabase.functions.invoke("tailor-documents", {
      body: { action: "prepare_prompt", job_id: selectedJob.id, resume_code: documentResumeCode },
    });
    if (error || !data?.prompt) setDocumentMessage(await edgeErrorMessage(error, "The prompt could not be prepared."));
    else {
      await navigator.clipboard.writeText(data.prompt);
      setPromptCopied(true);
      setDocumentMessage("Prompt copied. Paste it into any document service when your saved provider is unavailable or at its limit.");
      window.setTimeout(() => setPromptCopied(false), 1800);
    }
    setDocumentBusy(false);
  };

  const generateDocuments = async () => {
    if (!selectedJob || !documentConsent) return;
    setDocumentBusy(true);
    setDocumentMessage("Generating one-page ATS documents on request. No application will be submitted.");
    const { data, error } = await supabase.functions.invoke("tailor-documents", {
      body: { action: "generate", job_id: selectedJob.id, resume_code: documentResumeCode },
    });
    if (error || !data?.documents) {
      setDocumentMessage(await edgeErrorMessage(error, "Document generation failed. No files were saved."));
    } else {
      setGeneratedDocuments((data.documents ?? []) as GeneratedDocument[]);
      setDocumentMessage(`Resume and cover letter created from ${data.resume_name || documentResumeCode}. Review both PDFs before applying.`);
      await loadDashboard();
    }
    setDocumentBusy(false);
  };

  const downloadGeneratedDocument = async (document: GeneratedDocument) => {
    const { data, error } = await supabase.storage.from("generated-documents").createSignedUrl(document.storage_path, 60);
    if (error || !data?.signedUrl) {
      setDocumentMessage(error?.message || "The generated document could not be opened.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const openNewJob = () => {
    setJobDraft({ ...EMPTY_JOB, date_found: new Date().toISOString().slice(0, 10) });
    setEditorMessage("");
    setJobEditorOpen(true);
  };

  const openJobEditor = (job: Job) => {
    setSelectedJob(null);
    setJobDraft({
      id: job.id,
      company: job.company,
      position: job.role,
      role_track: job.track,
      match_score: String(job.score),
      match_level: job.match,
      sponsorship: job.sponsorship,
      location: job.location,
      work_mode: job.mode,
      date_found: job.dateFound || "",
      matched_skills: job.tags.join(", "),
      gaps_risks: job.note,
      pipeline: job.pipeline,
      approved_to_apply: job.approved,
      employment_type: job.employmentType || "",
      source: job.source || "",
      job_url: job.jobUrl || "",
      career_page: job.careerPage || "",
      ats_platform: job.atsPlatform || "",
      cv_version: job.cvVersion || "",
      cv_status: job.cvStatus || "Not started",
      cover_letter_status: job.coverLetterStatus || "Not started",
      salary: job.salary || "",
      job_description: job.jobDescription || "",
    });
    setEditorMessage("");
    setJobEditorOpen(true);
  };

  const saveJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!jobDraft.company.trim() || !jobDraft.position.trim()) {
      setEditorMessage("Company and position are required.");
      return;
    }
    setEditorBusy(true);
    setEditorMessage("");
    const payload = {
      company: jobDraft.company.trim(),
      position: jobDraft.position.trim(),
      role_track: jobDraft.role_track.trim() || "Other",
      match_score: Math.max(0, Math.min(100, Number(jobDraft.match_score) || 0)),
      match_level: jobDraft.match_level,
      sponsorship: jobDraft.sponsorship.trim() || "Unknown",
      location: jobDraft.location.trim() || "Singapore",
      work_mode: jobDraft.work_mode.trim() || "Not specified",
      date_found: jobDraft.date_found || null,
      matched_skills: jobDraft.matched_skills.split(",").map((item) => item.trim()).filter(Boolean),
      gaps_risks: jobDraft.gaps_risks.trim() || null,
      pipeline: jobDraft.pipeline.trim() || "Discovered",
      approved_to_apply: jobDraft.approved_to_apply,
      employment_type: jobDraft.employment_type.trim() || null,
      source: jobDraft.source.trim() || "Manual entry",
      job_url: jobDraft.job_url.trim() || null,
      career_page: jobDraft.career_page.trim() || null,
      ats_platform: jobDraft.ats_platform.trim() || null,
      cv_version: jobDraft.cv_version.trim() || null,
      cv_status: jobDraft.cv_status.trim() || null,
      cover_letter_status: jobDraft.cover_letter_status.trim() || null,
      salary: jobDraft.salary.trim() || null,
      job_description: jobDraft.job_description.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const result = jobDraft.id
      ? await supabase.from("jobs").update(payload).eq("id", jobDraft.id)
      : await supabase.from("jobs").insert(payload);
    if (result.error) setEditorMessage(result.error.message);
    else {
      setJobEditorOpen(false);
      await loadDashboard();
    }
    setEditorBusy(false);
  };

  const deleteJob = async () => {
    if (!jobDraft.id || !window.confirm("Delete this job record from Supabase?")) return;
    setEditorBusy(true);
    const { error } = await supabase.from("jobs").delete().eq("id", jobDraft.id);
    if (error) setEditorMessage(error.message);
    else {
      setJobEditorOpen(false);
      await loadDashboard();
    }
    setEditorBusy(false);
  };

  const openProfileEditor = () => {
    if (!profile) return;
    setProfileDraft({ ...profile, languages: [...profile.languages] });
    setEditorMessage("");
    setProfileEditorOpen(true);
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profileDraft) return;
    setEditorBusy(true);
    const { error } = await supabase.from("private_profile").update({
      ...profileDraft,
      notion_url: profileDraft.notion_url || null,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (error) setEditorMessage(error.message);
    else {
      setProfileEditorOpen(false);
      await loadDashboard();
    }
    setEditorBusy(false);
  };

  const openResumeEditor = (resume: Resume) => {
    setResumeDraft({ ...resume });
    setResumeFiles([]);
    setEditorMessage("");
    setResumeEditorOpen(true);
  };

  const downloadResumeFile = async (resumeFile: Pick<ResumeFile, "storage_path">) => {
    setDataError("");
    const { data, error } = await supabase.storage.from("resume-files").createSignedUrl(resumeFile.storage_path, 60);
    if (error || !data?.signedUrl) {
      setDataError(error?.message || "The resume file could not be opened.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const downloadResume = async (resume: Resume) => {
    const primary = resume.resume_files?.find((file) => file.file_format === "docx")
      || resume.resume_files?.[0]
      || (resume.storage_path ? { storage_path: resume.storage_path } : null);
    if (primary) await downloadResumeFile(primary);
  };

  const analyseResumeForCriteria = async (file: File) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Your session expired. Sign in again before analysing a resume.");
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/resume-criteria", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.suggestion) throw new Error(result.error || "The resume could not be analysed.");
    return result.suggestion as DiscoveryCriteriaSuggestion;
  };

  const saveResume = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resumeDraft) return;
    setEditorBusy(true);
    setEditorMessage("");
    const selectedFormats = resumeFiles.map((file) => file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "docx");
    if (new Set(selectedFormats).size !== selectedFormats.length) {
      setEditorMessage("Choose at most one DOCX and one PDF for this resume.");
      setEditorBusy(false);
      return;
    }
    const invalidFile = resumeFiles.find((file) => file.size > 8 * 1024 * 1024 || !/\.(docx|pdf)$/i.test(file.name));
    if (invalidFile) {
      setEditorMessage(`${invalidFile.name} must be a DOCX or PDF no larger than 8 MB.`);
      setEditorBusy(false);
      return;
    }

    let suggestion: DiscoveryCriteriaSuggestion | null = null;
    let analysisMessage = "";
    if (resumeFiles.length) {
      try {
        suggestion = await analyseResumeForCriteria(resumeFiles.find((file) => /\.docx$/i.test(file.name)) || resumeFiles[0]);
      } catch (error) {
        analysisMessage = error instanceof Error ? error.message : "Criteria analysis was unavailable.";
      }
    }

    const previousFiles = resumeDraft.resume_files ?? [];
    const uploaded: ResumeFile[] = [];
    for (const [index, file] of resumeFiles.entries()) {
      const format = selectedFormats[index] as "docx" | "pdf";
      const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const nextPath = `${resumeDraft.code}/${Date.now()}-${format}-${safeFilename}`;
      const { error: uploadError } = await supabase.storage.from("resume-files").upload(nextPath, file, {
        cacheControl: "3600",
        contentType: file.type || (format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        upsert: false,
      });
      if (uploadError) {
        if (uploaded.length) await supabase.storage.from("resume-files").remove(uploaded.map((item) => item.storage_path));
        setEditorMessage(uploadError.message);
        setEditorBusy(false);
        return;
      }
      uploaded.push({
        id: 0,
        resume_code: resumeDraft.code,
        file_format: format,
        storage_path: nextPath,
        original_filename: file.name,
        mime_type: file.type || (format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        file_size: file.size,
      });
    }

    if (uploaded.length) {
      const fileRows = uploaded.map((file) => ({
        resume_code: file.resume_code,
        file_format: file.file_format,
        storage_path: file.storage_path,
        original_filename: file.original_filename,
        mime_type: file.mime_type,
        file_size: file.file_size,
      }));
      const { error: fileRowError } = await supabase.from("resume_files").upsert(fileRows, { onConflict: "resume_code,file_format" });
      if (fileRowError) {
        await supabase.storage.from("resume-files").remove(uploaded.map((item) => item.storage_path));
        setEditorMessage(fileRowError.message);
        setEditorBusy(false);
        return;
      }
    }

    const nextDocx = uploaded.find((file) => file.file_format === "docx") || previousFiles.find((file) => file.file_format === "docx");
    const nextPrimary = nextDocx || uploaded[0] || previousFiles[0] || null;

    const { error } = await supabase.from("resumes").update({
      name: resumeDraft.name.trim(),
      fit: resumeDraft.fit.trim(),
      recommendation: resumeDraft.recommendation.trim(),
      storage_path: nextPrimary?.storage_path || resumeDraft.storage_path || null,
      original_filename: nextPrimary?.original_filename || resumeDraft.original_filename || null,
      updated_at: new Date().toISOString(),
    }).eq("code", resumeDraft.code);
    if (error) {
      for (const uploadedFile of uploaded) {
        const previous = previousFiles.find((file) => file.file_format === uploadedFile.file_format);
        if (previous) {
          await supabase.from("resume_files").upsert({
            resume_code: previous.resume_code,
            file_format: previous.file_format,
            storage_path: previous.storage_path,
            original_filename: previous.original_filename,
            mime_type: previous.mime_type,
            file_size: previous.file_size,
          }, { onConflict: "resume_code,file_format" });
        } else {
          await supabase.from("resume_files").delete().eq("resume_code", resumeDraft.code).eq("file_format", uploadedFile.file_format);
        }
      }
      if (uploaded.length) await supabase.storage.from("resume-files").remove(uploaded.map((item) => item.storage_path));
      setEditorMessage(error.message);
    }
    else {
      const replacedPaths = previousFiles
        .filter((previous) => uploaded.some((file) => file.file_format === previous.file_format) && !uploaded.some((file) => file.storage_path === previous.storage_path))
        .map((file) => file.storage_path);
      if (replacedPaths.length) await supabase.storage.from("resume-files").remove(replacedPaths);
      if (suggestion) {
        await supabase.from("app_settings").update({
          discovery_criteria_suggestion: suggestion,
          discovery_criteria_suggestion_status: "pending",
          discovery_criteria_suggestion_source_resume: resumeDraft.code,
          discovery_criteria_suggestion_created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", 1);
      }
      setResumeEditorOpen(false);
      setResumeFiles([]);
      await loadDashboard();
      if (suggestion) setDiscoveryMessage(`A new scout criteria proposal was prepared from ${resumeDraft.name}. Review it in Security and connections before approval.`);
      else if (analysisMessage) setDataError(`Resume saved, but no criteria proposal was created: ${analysisMessage}`);
    }
    setEditorBusy(false);
  };

  const signOut = async () => {
    window.localStorage.removeItem(SESSION_ACTIVITY_KEY);
    await supabase.auth.signOut();
    setSecurityOpen(false);
    setAuthPhase("signed_out");
  };

  if (authPhase === "checking") {
    return <main className="auth-shell"><div className="auth-loading"><BrandLogo priority /><p>Opening your private command center...</p></div></main>;
  }
  if (authPhase === "signed_out") return <AuthScreen onAuthenticated={loadDashboard} />;
  if (authPhase === "denied") {
    return <main className="auth-shell"><section className="auth-card denied-card"><p className="eyebrow">Access denied</p><h1>This account is not authorized.</h1><p className="auth-copy">Sign in with the administrator account linked to this dashboard.</p><button className="primary-button auth-primary" onClick={signOut}>Sign out</button></section></main>;
  }

  const notionHub = settings?.notion_hub_url || FALLBACK_NOTION_HUB;
  const topJob = jobs.find((job) => job.match === "Strong") || jobs[0] || null;
  const strongCount = jobs.filter((job) => job.match === "Strong").length;
  const reviewCount = jobs.filter((job) => job.match === "Review").length;
  const blockedCount = jobs.filter((job) => job.match === "Blocked").length;
  const todayLabel = new Intl.DateTimeFormat("en-SG", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(currentDate);
  const greeting = currentDate.getHours() < 12 ? "Good morning" : currentDate.getHours() < 18 ? "Good afternoon" : "Good evening";
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time";
  const timeZoneShort = new Intl.DateTimeFormat("en-SG", { timeZoneName: "short" }).formatToParts(currentDate).find((part) => part.type === "timeZoneName")?.value || "";
  const clockLabel = new Intl.DateTimeFormat("en-SG", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(currentDate);
  const daysToAvailability = profile?.available_from
    ? Math.max(0, Math.ceil((new Date(`${profile.available_from}T00:00:00+08:00`).getTime() - currentDate.getTime()) / 86_400_000))
    : 0;
  const companySourceCount = settings?.discovery_source_urls?.length ?? 0;
  const sourceCount = companySourceCount + (webSearchEnabled && webSearchConfigured ? 1 : 0);
  const discoveryReady = discoveryEnabled && sourceCount > 0;
  const scheduleZone = (settings?.discovery_timezone || discoveryTimezone) === "Asia/Singapore" ? "SGT" : (settings?.discovery_timezone || discoveryTimezone);
  const jobSearchKeywords = "graduate junior software cybersecurity cloud IT support";
  const linkedInJobSearch = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(jobSearchKeywords)}&location=${encodeURIComponent(discoveryLocation)}`;
  const indeedJobSearch = `https://www.indeed.com/jobs?q=${encodeURIComponent(jobSearchKeywords)}&l=${encodeURIComponent(discoveryLocation)}&fromage=7`;
  const selectedSuggestion = selectedJob ? suggestResume(selectedJob, resumes) : null;
  const selectedResume = resumes.find((resume) => resume.code === documentResumeCode);
  const applicationAnswers = selectedJob
    ? buildApplicationAnswers(selectedJob, profile, currentUserEmail, selectedSuggestion)
    : [];
  const readyApplicationAnswers = applicationAnswers.filter((answer) => answer.ready).length;

  return (
    <main className={`${dark ? "app-shell dark" : "app-shell light"} text-size-${textSize}`}>
      <div className="aurora aurora-one" /><div className="aurora aurora-two" />

      <aside className="sidebar">
        <button className="brand" onClick={() => scrollTo("Overview")}>
          <BrandLogo priority />
          <span><strong>BRIAN</strong><small>Job OS</small></span>
        </button>
        <nav aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {navItems.map((item, index) => (
            <button key={item} className={index === 0 ? "nav-item active" : "nav-item"} onClick={() => scrollTo(item)}>
              <span className="nav-symbol" aria-hidden="true">{["⌂", "◫", "▤", "◎"][index]}</span>{item}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-mini">
            <span className="privacy-dot" />
            <div><strong>Admin protected</strong><small>Supabase RLS active</small></div>
          </div>
          <button className="notion-link" onClick={openSecurity}>Backup settings <span>›</span></button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><BrandLogo priority /><strong>Job OS</strong></div>
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input ref={searchRef} value={query} onChange={(event) => { setQuery(event.target.value); setVisibleJobCount(JOBS_PER_PAGE); }} placeholder="Search jobs, companies, skills" aria-label="Search jobs" />
            <kbd>/</kbd>
          </label>
          <div className="top-actions">
            <button className="icon-button" onClick={() => setDark((value) => !value)} aria-label="Toggle color theme">{dark ? "☼" : "◐"}</button>
            <button className="avatar avatar-button" title="Security and connections" onClick={openSecurity} aria-label="Open security and connections">BN<span /></button>
          </div>
        </header>

        <div className="content">
          {dataError ? <div className="data-banner" role="alert"><span>!</span><p><strong>Live data needs attention</strong>{dataError}</p><button onClick={loadDashboard}>Retry</button></div> : null}
          <section id="overview" className="welcome-section">
            <div>
              <p className="eyebrow" suppressHydrationWarning>{todayLabel}</p>
              <h1 suppressHydrationWarning>{greeting}, Brian.</h1>
              <p className="subcopy">{dataLoading ? "Refreshing your private workspace..." : `${jobs.length} opportunities tracked. ${strongCount} strong ${strongCount === 1 ? "match is" : "matches are"} ready for review.`}</p>
            </div>
            <div className="welcome-meta">
              <div className="browser-clock" aria-label={`Browser time in ${browserTimeZone}`}>
                <span aria-hidden="true"><DashboardIcon name="clock" /></span>
                <div><time suppressHydrationWarning>{clockLabel}</time><small suppressHydrationWarning>{browserTimeZone}{timeZoneShort ? ` · ${timeZoneShort}` : ""}</small></div>
              </div>
              <div className="secure-chip"><span aria-hidden="true">◉</span> Supabase admin session</div>
            </div>
          </section>

          <section className="stats-grid" aria-label="Application summary">
            <article className="stat-card featured"><div className="stat-top"><span className="stat-icon"><DashboardIcon name="sparkles" /></span><span className="trend">Live score</span></div><strong>{strongCount}</strong><p>Strong {strongCount === 1 ? "match" : "matches"}</p></article>
            <article className="stat-card"><div className="stat-top"><span className="stat-icon cyan-icon"><DashboardIcon name="queue" /></span><span className="muted-label">Needs you</span></div><strong>{reviewCount}</strong><p>Review queue</p></article>
            <article className="stat-card"><div className="stat-top"><span className="stat-icon amber-icon"><DashboardIcon name="blocked" /></span><span className="muted-label">Filtered safely</span></div><strong>{blockedCount}</strong><p>Blocked roles</p></article>
            <article className="stat-card"><div className="stat-top"><span className="stat-icon green-icon"><DashboardIcon name="records" /></span><span className="live-label"><i /> Live</span></div><strong className="time-stat">{jobs.length}</strong><p>Supabase records</p></article>
          </section>

          <section className="focus-grid">
            <article className="focus-card">
              <div className="focus-copy">
                <div className="section-kicker"><span>Top opportunity</span><span className="fresh-pill">{topJob?.found || "Waiting"}</span></div>
                <p className="company-name">{topJob?.company.toUpperCase() || "LIVE PIPELINE"}</p>
                <h2>{topJob?.role || "Add your first opportunity"}</h2>
                <p className="focus-description">{topJob?.note || "Your private Supabase database is ready for live job records."}</p>
                <div className="focus-tags">{topJob?.tags.length ? topJob.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>No skills loaded yet</span>}</div>
                <div className="focus-actions">
                  <button className="primary-button" disabled={!topJob} onClick={() => topJob && openJobDetails(topJob)}>Review match</button>
                  <button className="secondary-button" disabled={!topJob} onClick={() => topJob && toggleSave(topJob.id)}>{topJob && saved.includes(topJob.id) ? "Saved" : "Save role"}</button>
                </div>
              </div>
              <div className="focus-visual" aria-label={`${topJob?.score || 0} percent match`}>
                <div className="orbital orbital-one" /><div className="orbital orbital-two" />
                <div className="hero-score"><span>FIT SCORE</span><strong>{topJob?.score || 0}</strong><small>out of 100</small></div>
                <div className="fit-chip fit-one">{topJob?.track || "Role fit"}</div><div className="fit-chip fit-two">{topJob?.match || "Pending"}</div><div className="risk-chip">Sponsorship {topJob?.sponsorship.toLowerCase() || "unknown"}</div>
              </div>
            </article>

            <aside className={discoveryReady ? "scout-card" : "scout-card paused"}>
              <div className="scout-header"><div className={discoveryReady ? "pulse-mark" : "pulse-mark paused"}><span /></div><div><p>Job Match Scout</p><strong>{scoutToggleBusy ? "Updating..." : discoveryReady ? "Active" : discoveryEnabled ? "Setup needed" : "Paused"}</strong></div><button type="button" className={discoveryReady ? "on-switch" : "on-switch paused"} onClick={toggleDiscoveryAutomation} disabled={scoutToggleBusy} aria-pressed={discoveryEnabled} aria-label={discoveryEnabled ? "Pause automatic job discovery" : "Resume automatic job discovery"} title={discoveryEnabled ? "Pause automatic job discovery" : "Resume automatic job discovery"}><i /></button></div>
              <div className={discoveryReady ? "scan-visual" : "scan-visual paused"} aria-label={discoveryReady ? "Job discovery radar active" : "Job discovery radar paused"}><span className="scan-line" /><div className="scan-core">⌕</div></div>
              <div className="scan-stats"><div><strong>{sourceCount}</strong><span>source types</span></div><div><strong>{jobs.length}</strong><span>roles tracked</span></div><div><strong>{strongCount}</strong><span>strong fit</span></div></div>
              <p className="next-scan">{discoveryEnabled ? `Daily at ${formatScheduleTime(settings?.discovery_time || discoveryTime)} ${scheduleZone}` : "Automatic discovery is paused"}</p>
              <div className="scout-actions"><button className="primary-button compact" onClick={fetchJobsNow} disabled={discoveryBusy || !sourceCount}>{discoveryBusy ? "Fetching..." : "Fetch now"}</button><button className="secondary-button" onClick={openSecurity}>Discovery settings</button></div>
            </aside>
          </section>

          <section id="pipeline" className="pipeline-section">
            <div className="section-heading">
              <div><p className="eyebrow">Smart review queue</p><h2>Opportunity pipeline</h2></div>
              <button className="primary-button compact" onClick={openNewJob}>Add opportunity</button>
            </div>
            <div className="filter-row">
              <div className="filter-tabs" role="tablist" aria-label="Filter jobs">
                {["All", "Strong", "Review", "Blocked"].map((item) => (
                  <button key={item} className={filter === item ? "active" : ""} onClick={() => { setFilter(item); setVisibleJobCount(JOBS_PER_PAGE); }} role="tab" aria-selected={filter === item}>
                    {item}<span>{item === "All" ? jobs.length : jobs.filter((job) => job.match === item).length}</span>
                  </button>
                ))}
              </div>
              <div className="pipeline-tools">
                <label className="date-sort"><span>Decision</span><select value={pipelineFilter} onChange={(event) => { setPipelineFilter(event.target.value); setVisibleJobCount(JOBS_PER_PAGE); }}><option>Active</option><option>Accepted</option><option>Applied</option><option>Rejected</option><option>All statuses</option></select></label>
                <label className="date-sort feed-date-filter"><span>Feed date</span><select value={feedDate} onChange={(event) => { setFeedDate(event.target.value); setVisibleJobCount(JOBS_PER_PAGE); }}><option value="all">All feed dates</option>{availableFeedDates.map((date) => <option key={date} value={date}>{feedDateLabel(date)}</option>)}</select></label>
                <label className="date-sort"><span>Sort by date</span><select value={jobSort} onChange={(event) => { setJobSort(event.target.value as "newest" | "oldest"); setVisibleJobCount(JOBS_PER_PAGE); }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
                <p>Showing {visibleJobs.length} of {filteredJobs.length}</p>
              </div>
            </div>
            <div className="job-list">
              {filteredJobs.length ? groupedVisibleJobs.map(([date, dateJobs]) => (
                <Fragment key={date}>
                  <div className="feed-day-heading"><span>{feedDateLabel(date === "undated" ? null : date)}</span><small>{dateJobs.length} {dateJobs.length === 1 ? "job" : "jobs"} shown · highest match first</small></div>
                  {dateJobs.map((job) => <JobCard key={job.id} job={job} saved={saved.includes(job.id)} onSave={() => toggleSave(job.id)} onOpen={() => openJobDetails(job)} onDecision={(decision) => void setJobDecision(job, decision)} decisionBusy={decisionBusyId === job.id} />)}
                </Fragment>
              )) : (
                <div className="empty-state"><span>⌕</span><h3>No matching jobs</h3><p>Try a different search, match filter, or feed date.</p></div>
              )}
            </div>
            {remainingJobCount > 0 ? <div className="load-more-row"><button className="load-more-button" onClick={() => setVisibleJobCount((count) => Math.min(count + JOBS_PER_PAGE, filteredJobs.length))}><span>Load more jobs</span><small>{remainingJobCount} remaining</small></button></div> : null}
          </section>

          <section id="resumes" className="resumes-section">
            <div className="section-heading">
              <div><p className="eyebrow">Document intelligence</p><h2>Resume command center</h2></div>
              <p className="section-note">Private upload portal with DOCX and PDF versions. Tailoring uses verified facts only.</p>
            </div>

            <div className="resume-layout">
              <div className="resume-vault">
                {resumes.map((resume) => (
                  <article className="resume-card" key={resume.name}>
                    <div className={`resume-code ${resume.tone}`}>{resume.code}</div>
                    <div className="resume-copy">
                      <div className="resume-title-row"><h3>{resume.name}</h3>{resume.name === "Developer" ? <span>Top fit</span> : null}</div>
                      <p>{resume.fit}</p>
                      <small>{resume.recommendation}</small>
                    </div>
                    <div className="resume-actions">
                      {resume.resume_files?.length ? [...resume.resume_files].sort((left, right) => left.file_format.localeCompare(right.file_format)).map((file) => <button key={file.id} className="resume-format-button" onClick={() => downloadResumeFile(file)} aria-label={`Download ${resume.name} ${file.file_format.toUpperCase()}`}>{file.file_format.toUpperCase()}</button>) : resume.storage_path ? <button className="resume-open" onClick={() => downloadResume(resume)} aria-label={`Download ${resume.name} resume`}>↓</button> : null}
                      <button className="resume-open" onClick={() => openResumeEditor(resume)} aria-label={`Edit ${resume.name} resume`}>✎</button>
                    </div>
                  </article>
                ))}
                <div className="truth-rule"><span>✓</span><p><strong>Truth-locked tailoring</strong>No invented experience, certification, language, or employment claim.</p></div>
              </div>

              <article className="salary-card">
                <div className="salary-card-header">
                  <div><p className="eyebrow">S Pass planner</p><h3>Expected salary answer</h3></div>
                  <span className="verified-badge">Verified rule</span>
                </div>
                <div className="segmented-control" aria-label="Application date period">
                  <button className={salaryEra === "2026" ? "active" : ""} onClick={() => setSalaryEra("2026")}>Before 1 Jan 2027</button>
                  <button className={salaryEra === "2027" ? "active" : ""} onClick={() => setSalaryEra("2027")}>From 1 Jan 2027</button>
                </div>
                <div className="sector-switcher">
                  <button className={!financialSector ? "active" : ""} onClick={() => setFinancialSector(false)}>General sectors</button>
                  <button className={financialSector ? "active" : ""} onClick={() => setFinancialSector(true)}>Financial services</button>
                </div>
                <div className="salary-amount">
                  <span>S$</span><strong>{salary.toLocaleString()}</strong><small>fixed monthly</small>
                </div>
                <p className="salary-explanation">Use exactly the applicable minimum for Brian&apos;s age band. Re-check MOM before each submission.</p>
                <div className="salary-actions">
                  <button className="primary-button" onClick={copySalary}>{copied ? "Copied" : "Copy answer"}</button>
                  <a className="secondary-button" href={MOM_S_PASS} target="_blank" rel="noreferrer">Official MOM criteria ↗</a>
                </div>
              </article>
            </div>
          </section>

          <section id="profile" className="profile-section">
            <div className="section-heading">
              <div><p className="eyebrow">Private profile</p><h2>Application facts, protected</h2></div>
              <button className="primary-button compact" onClick={openProfileEditor}>Edit profile</button>
            </div>

            <div className="profile-layout">
              <article className="identity-card">
                <div className="identity-header">
                  <div className="identity-avatar">BN</div>
                  <div><p>Verified applicant</p><h3>{profile?.full_name || "Private profile"}</h3><span>{profile?.location || "Singapore"} • Graduate candidate</span></div>
                  <button className="reveal-button" onClick={() => setRevealProfile((value) => !value)}>{revealProfile ? "Hide details" : "Reveal details"}</button>
                </div>
                <div className={revealProfile ? "profile-facts revealed" : "profile-facts masked"}>
                  <div><span>Date of birth</span><strong>{revealProfile ? formatLongDate(profile?.date_of_birth) : "•• ••••• ••••"}</strong></div>
                  <div><span>Nationality</span><strong>{revealProfile ? profile?.nationality || "Not set" : "••••••••••"}</strong></div>
                  <div><span>Current pass</span><strong>{revealProfile ? profile?.current_pass || "Not set" : "••••••• ••••"}</strong></div>
                  <div><span>Pass expiry</span><strong>{revealProfile ? formatLongDate(profile?.pass_expiry) : "•• ••••••••• ••••"}</strong></div>
                  <div><span>Availability</span><strong>{revealProfile ? formatLongDate(profile?.available_from) : "•• •••••• ••••"}</strong></div>
                  <div><span>Languages</span><strong>{revealProfile ? profile?.languages.join(", ") || "Not set" : `${profile?.languages.length || 0} verified`}</strong></div>
                </div>
                <div className="identity-footer">
                  <span>Mandarin: {profile?.mandarin_proficiency ? "proficient" : "no proficiency"}</span><span>Citizen or PR: {profile?.singapore_citizen_or_pr ? "yes" : "no"}</span><span>Sponsorship: {profile?.sponsorship_required ? "required" : "not required"}</span>
                </div>
                <button className="profile-link" onClick={openProfileEditor}>Edit profile in this dashboard <span>›</span></button>
              </article>

              <aside className="readiness-column">
                <article className="readiness-card">
                  <div className="readiness-top"><p>Work readiness</p><span>Confirmed</span></div>
                  <div className="countdown-row"><strong>{daysToAvailability}</strong><div><span>days to availability</span><small>{formatLongDate(profile?.available_from)}</small></div></div>
                  <div className="timeline"><i /><span /><span /></div>
                  <div className="timeline-labels"><span>Today</span><span>Start</span><span>Pass expiry</span></div>
                </article>
                <article className="access-card">
                  <div className="access-icon">◎</div>
                  <div><p>Access policy</p><h3>Private by design</h3></div>
                  <ul><li><span>Authorized admin</span><strong>1</strong></li><li><span>Other accounts</span><strong>0</strong></li><li><span>Database RLS</span><strong>On</strong></li></ul>
                </article>
              </aside>
            </div>
          </section>

          <footer><p suppressHydrationWarning>© {currentDate.getFullYear()} Le Do Nguyen Tu. All rights reserved.</p><span>Proudly made by Le Do Nguyen Tu.</span></footer>
        </div>
      </section>

      {selectedJob ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedJob(null)}>
          <section className="job-modal" role="dialog" aria-modal="true" aria-labelledby="job-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedJob(null)} aria-label="Close details">×</button>
            <div className={`company-mark large ${selectedJob.tone}`}>{selectedJob.initials}</div>
            <p className="company-name">{selectedJob.company}</p><h2 id="job-modal-title">{selectedJob.role}</h2>
            <div className="modal-score-row"><span className={`match-pill ${selectedJob.match.toLowerCase()}`}>{selectedJob.match}</span><strong>{selectedJob.score}/100 match</strong></div>
            <div className="decision-actions modal-decision-actions" aria-label={`Decision for ${selectedJob.role}`}>
              <button type="button" className={selectedJob.pipeline === "Accepted" ? "accepted active" : "accepted"} onClick={() => void setJobDecision(selectedJob, "Accepted")} disabled={decisionBusyId === selectedJob.id}>✓ Accept</button>
              <button type="button" className={selectedJob.pipeline === "Applied" ? "applied active" : "applied"} onClick={() => void setJobDecision(selectedJob, "Applied")} disabled={decisionBusyId === selectedJob.id}>↗ Applied</button>
              <button type="button" className={selectedJob.pipeline === "Rejected" ? "rejected active" : "rejected"} onClick={() => void setJobDecision(selectedJob, "Rejected")} disabled={decisionBusyId === selectedJob.id}>× Reject</button>
            </div>
            <p className="modal-note">{selectedJob.note}</p>
            <div className="modal-checks">
              <div><span>✓</span><p><strong>Role level</strong>Graduate or entry-level scope</p></div>
              <div><span>✓</span><p><strong>Location</strong>Singapore</p></div>
              <div className={selectedJob.match === "Blocked" ? "warning" : ""}><span>{selectedJob.match === "Blocked" ? "!" : "?"}</span><p><strong>Next check</strong>{selectedJob.match === "Blocked" ? "Language requirement blocks this role" : "Confirm employer sponsorship"}</p></div>
            </div>
            <section className="document-studio">
              <div className="document-studio-heading">
                <div><p>DOCUMENT FIT</p><h3>Resume and cover letter</h3></div>
                {selectedSuggestion ? <span className={`baseline-score ${selectedSuggestion.color}`}><strong>{selectedSuggestion.score}%</strong>{selectedSuggestion.label}</span> : null}
              </div>
              {selectedSuggestion ? <p className="document-guidance"><strong>Suggested baseline: {selectedSuggestion.name} ({selectedSuggestion.code})</strong>{selectedSuggestion.guidance}</p> : null}
              <label className="document-select"><span>Baseline for this job</span><select value={documentResumeCode} onChange={(event) => setDocumentResumeCode(event.target.value)}>{resumes.map((resume) => <option value={resume.code} key={resume.code}>{resume.name} - {resume.code}</option>)}</select></label>
              <div className="jd-preview">
                <span>Job description used</span>
                <p>{selectedJob.jobDescription || "No full job description is stored yet. Add it in Edit in dashboard for stronger matching and tailoring."}</p>
              </div>
              <div className="document-actions">
                <button className="secondary-button" onClick={copyExternalPrompt} disabled={documentBusy || !selectedResume?.storage_path}>{promptCopied ? "Prompt copied" : "Copy external prompt"}</button>
                <button className="primary-button" onClick={generateDocuments} disabled={documentBusy || !documentConsent || !settings?.document_provider_configured || !selectedResume?.storage_path}>{documentBusy ? "Working..." : "Generate tailored PDFs"}</button>
              </div>
              <label className="provider-consent"><input type="checkbox" checked={documentConsent} onChange={(event) => setDocumentConsent(event.target.checked)} /><span>Send this job description, verified applicant facts, and selected resume to my configured provider only for this request.</span></label>
              {!settings?.document_provider_configured ? <p className="document-notice">No provider key is saved. The external prompt button still works. Add a key in Security and connections when you want in-site PDF generation.</p> : null}
              {documentMessage ? <p className="document-message" role="status">{documentMessage}</p> : null}
              {generatedDocuments.length ? <div className="generated-list">
                <p>PRIVATE PDF EXPORTS</p>
                {generatedDocuments.map((document) => <button key={document.id} onClick={() => downloadGeneratedDocument(document)}><span>{document.document_type === "resume" ? "Resume" : "Cover letter"}</span><small>{document.source_resume_code} - {new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(document.created_at))}</small><strong>Download ↓</strong></button>)}
              </div> : null}
            </section>
            <section className="application-assistant" aria-labelledby="application-assistant-title">
              <div className="application-assistant-heading">
                <div><p>APPLICATION ASSISTANT</p><h3 id="application-assistant-title">Ready-to-paste answers</h3></div>
                <span>{readyApplicationAnswers} ready · {applicationAnswers.length - readyApplicationAnswers} manual</span>
              </div>
              <p className="application-assistant-copy">Prepared for {selectedJob.atsPlatform || "this employer portal"} from your verified profile and this job record. Review long answers and eligibility fields before pasting.</p>
              <div className="application-answer-list">
                {applicationAnswers.map((answer) => (
                  <article key={answer.id} className={answer.ready ? "application-answer" : "application-answer manual"}>
                    <div className="application-answer-title"><span>{answer.category}</span><strong>{answer.label}</strong></div>
                    <p>{answer.value || "Missing from your verified profile"}</p>
                    {answer.note ? <small>{answer.note}</small> : null}
                    {answer.ready ? <button type="button" onClick={() => void copyApplicationValue(answer)}>{copiedApplicationField === answer.id ? "Copied" : "Copy"}</button> : <span className="manual-badge">Check manually</span>}
                  </article>
                ))}
              </div>
              <div className="application-pack-actions">
                <button type="button" className="secondary-button" onClick={() => void copyApplicationPack(applicationAnswers)}>{copiedApplicationField === "all" ? "Application pack copied" : "Copy all answers"}</button>
                {selectedJob.jobUrl ? <button type="button" className="primary-button" onClick={() => openJobWithApplicationPack(selectedJob, applicationAnswers)}>Open listing + copy pack ↗</button> : null}
              </div>
              <p className="application-safety-note">This prepares answers only. It never fills declarations, solves CAPTCHA, signs in, or submits an application.</p>
            </section>
            <div className="modal-actions">
              <button className="primary-button" onClick={() => openJobEditor(selectedJob)}>Edit in dashboard</button>
              {selectedJob.jobUrl ? <a className="secondary-button" href={selectedJob.jobUrl} target="_blank" rel="noreferrer">Open job listing ↗</a> : null}
            </div>
            <p className="approval-note">No application is submitted without your approval.</p>
          </section>
        </div>
      ) : null}

      {jobEditorOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setJobEditorOpen(false)}>
          <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="job-editor-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setJobEditorOpen(false)} aria-label="Close job editor">×</button>
            <p className="eyebrow">Supabase record</p>
            <h2 id="job-editor-title">{jobDraft.id ? "Edit opportunity" : "Add opportunity"}</h2>
            <p className="editor-intro">Changes are saved directly to your private database.</p>
            <form className="editor-form" onSubmit={saveJob}>
              <div className="editor-grid two-column">
                <label><span>Company</span><input value={jobDraft.company} onChange={(event) => setJobDraft({ ...jobDraft, company: event.target.value })} required /></label>
                <label><span>Position</span><input value={jobDraft.position} onChange={(event) => setJobDraft({ ...jobDraft, position: event.target.value })} required /></label>
                <label><span>Role track</span><input value={jobDraft.role_track} onChange={(event) => setJobDraft({ ...jobDraft, role_track: event.target.value })} /></label>
                <label><span>Date found</span><input type="date" value={jobDraft.date_found} onChange={(event) => setJobDraft({ ...jobDraft, date_found: event.target.value })} /></label>
                <label><span>Match level</span><select value={jobDraft.match_level} onChange={(event) => setJobDraft({ ...jobDraft, match_level: event.target.value as JobDraft["match_level"] })}><option>Strong</option><option>Review</option><option>Blocked</option></select></label>
                <label><span>Match score</span><input type="number" min="0" max="100" value={jobDraft.match_score} onChange={(event) => setJobDraft({ ...jobDraft, match_score: event.target.value })} /></label>
                <label><span>Pipeline status</span><select value={jobDraft.pipeline} onChange={(event) => setJobDraft({ ...jobDraft, pipeline: event.target.value })}><option>Discovered</option><option>Review</option><option>Preparing</option><option>Accepted</option><option>Applied</option><option>Interview</option><option>Offer</option><option>Rejected</option><option>Blocked</option></select></label>
                <label><span>Sponsorship</span><select value={jobDraft.sponsorship} onChange={(event) => setJobDraft({ ...jobDraft, sponsorship: event.target.value })}><option>Unknown</option><option>Available</option><option>Possible</option><option>Not available</option></select></label>
                <label><span>Location</span><input value={jobDraft.location} onChange={(event) => setJobDraft({ ...jobDraft, location: event.target.value })} /></label>
                <label><span>Work mode</span><select value={jobDraft.work_mode} onChange={(event) => setJobDraft({ ...jobDraft, work_mode: event.target.value })}><option>Not specified</option><option>On-site</option><option>Hybrid</option><option>Remote</option></select></label>
                <label><span>Employment type</span><input value={jobDraft.employment_type} onChange={(event) => setJobDraft({ ...jobDraft, employment_type: event.target.value })} /></label>
                <label><span>Source</span><input value={jobDraft.source} onChange={(event) => setJobDraft({ ...jobDraft, source: event.target.value })} /></label>
                <label><span>Job URL</span><input type="url" value={jobDraft.job_url} onChange={(event) => setJobDraft({ ...jobDraft, job_url: event.target.value })} placeholder="https://" /></label>
                <label><span>Career page</span><input type="url" value={jobDraft.career_page} onChange={(event) => setJobDraft({ ...jobDraft, career_page: event.target.value })} placeholder="https://" /></label>
                <label><span>ATS platform</span><input value={jobDraft.ats_platform} onChange={(event) => setJobDraft({ ...jobDraft, ats_platform: event.target.value })} placeholder="Workday, Greenhouse, Lever..." /></label>
                <label><span>Expected salary</span><input value={jobDraft.salary} onChange={(event) => setJobDraft({ ...jobDraft, salary: event.target.value })} placeholder="S$3,300" /></label>
                <label><span>CV version</span><input value={jobDraft.cv_version} onChange={(event) => setJobDraft({ ...jobDraft, cv_version: event.target.value })} /></label>
                <label><span>CV status</span><select value={jobDraft.cv_status} onChange={(event) => setJobDraft({ ...jobDraft, cv_status: event.target.value })}><option>Not started</option><option>Drafting</option><option>Ready</option><option>Submitted</option></select></label>
                <label><span>Cover letter status</span><select value={jobDraft.cover_letter_status} onChange={(event) => setJobDraft({ ...jobDraft, cover_letter_status: event.target.value })}><option>Not started</option><option>Drafting</option><option>Ready</option><option>Submitted</option><option>Not required</option></select></label>
                <label className="checkbox-field"><input type="checkbox" checked={jobDraft.approved_to_apply} onChange={(event) => setJobDraft({ ...jobDraft, approved_to_apply: event.target.checked })} /><span>Approved to apply</span></label>
              </div>
              <label><span>Matched skills, separated by commas</span><input value={jobDraft.matched_skills} onChange={(event) => setJobDraft({ ...jobDraft, matched_skills: event.target.value })} /></label>
              <label><span>Full job description</span><textarea className="job-description-field" value={jobDraft.job_description} onChange={(event) => setJobDraft({ ...jobDraft, job_description: event.target.value })} rows={10} placeholder="Paste the complete job description here. Discovered Greenhouse and Lever roles are filled automatically." /></label>
              <label><span>Notes and risks</span><textarea value={jobDraft.gaps_risks} onChange={(event) => setJobDraft({ ...jobDraft, gaps_risks: event.target.value })} rows={4} /></label>
              {editorMessage ? <p className="editor-message">{editorMessage}</p> : null}
              <div className="editor-actions">
                {jobDraft.id ? <button type="button" className="danger-button" onClick={deleteJob} disabled={editorBusy}>Delete record</button> : <span />}
                <button type="button" className="secondary-button" onClick={() => setJobEditorOpen(false)}>Cancel</button>
                <button className="primary-button" disabled={editorBusy}>{editorBusy ? "Saving..." : "Save to Supabase"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {profileEditorOpen && profileDraft ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setProfileEditorOpen(false)}>
          <section className="editor-modal compact-editor" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setProfileEditorOpen(false)} aria-label="Close profile editor">×</button>
            <p className="eyebrow">Private Supabase profile</p>
            <h2 id="profile-editor-title">Edit application facts</h2>
            <form className="editor-form" onSubmit={saveProfile}>
              <div className="editor-grid two-column">
                <label><span>Full name</span><input value={profileDraft.full_name} onChange={(event) => setProfileDraft({ ...profileDraft, full_name: event.target.value })} /></label>
                <label><span>Preferred name</span><input value={profileDraft.preferred_name} onChange={(event) => setProfileDraft({ ...profileDraft, preferred_name: event.target.value })} /></label>
                <label><span>Date of birth</span><input type="date" value={profileDraft.date_of_birth} onChange={(event) => setProfileDraft({ ...profileDraft, date_of_birth: event.target.value })} /></label>
                <label><span>Nationality</span><input value={profileDraft.nationality} onChange={(event) => setProfileDraft({ ...profileDraft, nationality: event.target.value })} /></label>
                <label><span>Current pass</span><input value={profileDraft.current_pass} onChange={(event) => setProfileDraft({ ...profileDraft, current_pass: event.target.value })} /></label>
                <label><span>Pass expiry</span><input type="date" value={profileDraft.pass_expiry} onChange={(event) => setProfileDraft({ ...profileDraft, pass_expiry: event.target.value })} /></label>
                <label><span>Available from</span><input type="date" value={profileDraft.available_from} onChange={(event) => setProfileDraft({ ...profileDraft, available_from: event.target.value })} /></label>
                <label><span>Location</span><input value={profileDraft.location} onChange={(event) => setProfileDraft({ ...profileDraft, location: event.target.value })} /></label>
              </div>
              <label><span>Languages, separated by commas</span><input value={profileDraft.languages.join(", ")} onChange={(event) => setProfileDraft({ ...profileDraft, languages: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
              <div className="toggle-grid">
                <label className="checkbox-field"><input type="checkbox" checked={profileDraft.mandarin_proficiency} onChange={(event) => setProfileDraft({ ...profileDraft, mandarin_proficiency: event.target.checked })} /><span>Mandarin proficient</span></label>
                <label className="checkbox-field"><input type="checkbox" checked={profileDraft.singapore_citizen_or_pr} onChange={(event) => setProfileDraft({ ...profileDraft, singapore_citizen_or_pr: event.target.checked })} /><span>Singapore citizen or PR</span></label>
                <label className="checkbox-field"><input type="checkbox" checked={profileDraft.sponsorship_required} onChange={(event) => setProfileDraft({ ...profileDraft, sponsorship_required: event.target.checked })} /><span>Sponsorship required</span></label>
              </div>
              {editorMessage ? <p className="editor-message">{editorMessage}</p> : null}
              <div className="editor-actions"><span /><button type="button" className="secondary-button" onClick={() => setProfileEditorOpen(false)}>Cancel</button><button className="primary-button" disabled={editorBusy}>Save profile</button></div>
            </form>
          </section>
        </div>
      ) : null}

      {resumeEditorOpen && resumeDraft ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setResumeEditorOpen(false)}>
          <section className="editor-modal compact-editor" role="dialog" aria-modal="true" aria-labelledby="resume-editor-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setResumeEditorOpen(false)} aria-label="Close resume editor">×</button>
            <p className="eyebrow">Resume profile {resumeDraft.code}</p>
            <h2 id="resume-editor-title">Edit resume details</h2>
            <form className="editor-form" onSubmit={saveResume}>
              <label><span>Name</span><input value={resumeDraft.name} onChange={(event) => setResumeDraft({ ...resumeDraft, name: event.target.value })} /></label>
              <label><span>Best fit</span><textarea rows={3} value={resumeDraft.fit} onChange={(event) => setResumeDraft({ ...resumeDraft, fit: event.target.value })} /></label>
              <label><span>Recommendation</span><textarea rows={3} value={resumeDraft.recommendation} onChange={(event) => setResumeDraft({ ...resumeDraft, recommendation: event.target.value })} /></label>
              <label className="file-field"><span>Resume documents</span><input type="file" multiple accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setResumeFiles(Array.from(event.target.files ?? []))} /></label>
              <p className="editor-note">{resumeFiles.length ? `${resumeFiles.map((file) => file.name).join(" and ")} will replace the matching formats. A criteria proposal will be prepared for review.` : resumeDraft.resume_files?.length ? `Current private formats: ${resumeDraft.resume_files.map((file) => file.file_format.toUpperCase()).join(" and ")}.` : resumeDraft.original_filename ? `Current private file: ${resumeDraft.original_filename}` : "Upload one DOCX, one PDF, or both. Files stay private and require your administrator session."}</p>
              {editorMessage ? <p className="editor-message">{editorMessage}</p> : null}
              <div className="editor-actions resume-editor-actions"><span />{resumeDraft.storage_path ? <button type="button" className="secondary-button" onClick={() => downloadResume(resumeDraft)}>Download current</button> : null}<button type="button" className="secondary-button" onClick={() => setResumeEditorOpen(false)}>Cancel</button><button className="primary-button" disabled={editorBusy}>{editorBusy ? "Saving..." : "Save resume"}</button></div>
            </form>
          </section>
        </div>
      ) : null}

      {securityOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSecurityOpen(false)}>
          <section className="security-modal" role="dialog" aria-modal="true" aria-labelledby="security-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSecurityOpen(false)} aria-label="Close security and connections">×</button>
            <p className="eyebrow">Private administration</p>
            <h2 id="security-title">Security and connections</h2>
            <p className="security-intro">Manage job discovery, sign-in credentials, passkeys, optional backup, and your administrator session.</p>

            <div className="security-account">
              <span className="security-icon">◎</span>
              <div><small>Authorized administrator</small><strong>{currentUserEmail}</strong></div>
              <span className="verified-badge">Verified only</span>
            </div>

            <section className="security-panel discovery-panel">
              <div className="security-heading"><div><p>Job discovery</p><h3>Location, schedule, and web coverage</h3></div><span className={discoveryEnabled && (normalizedDiscoverySources().length || webSearchConfigured) ? "connection-status connected" : "connection-status"}>{discoveryEnabled ? normalizedDiscoverySources().length || webSearchConfigured ? "Scheduled" : "Setup needed" : "Paused"}</span></div>
              <p className="security-copy">The scout combines direct company feeds with an automatic provider pool covering Tavily, Exa, Firecrawl, Brave Search, SerpApi, and Serper. Every manual or scheduled scan tries providers in that order and switches automatically when one is out of credits, rate-limited, or unavailable.</p>
              <form className="discovery-form" onSubmit={saveDiscoverySettings}>
                <label className="checkbox-field discovery-toggle"><input type="checkbox" checked={discoveryEnabled} onChange={(event) => setDiscoveryEnabled(event.target.checked)} /><span>Run automatically each day</span></label>
                <div className="discovery-schedule-grid">
                  <label><span>Target country</span><select value={discoveryCountry} onChange={(event) => { const country = event.target.value; setDiscoveryCountry(country); const label = DISCOVERY_COUNTRIES.find(([value]) => value === country)?.[1]; if (label) setDiscoveryLocation(label); }}>{DISCOVERY_COUNTRIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label><span>City, region, or country</span><input value={discoveryLocation} onChange={(event) => setDiscoveryLocation(event.target.value)} placeholder="Singapore, Kuala Lumpur, Ho Chi Minh City..." required /></label>
                </div>
                <div className="discovery-schedule-grid">
                  <label><span>Daily time</span><input type="time" value={discoveryTime} onChange={(event) => setDiscoveryTime(event.target.value)} required /></label>
                  <label><span>Timezone</span><select value={discoveryTimezone} onChange={(event) => setDiscoveryTimezone(event.target.value)}><option value="Asia/Singapore">Singapore - SGT</option><option value="Asia/Ho_Chi_Minh">Vietnam - ICT</option><option value="Asia/Kuala_Lumpur">Kuala Lumpur - MYT</option><option value="UTC">UTC</option></select></label>
                </div>
                <div className="web-search-heading"><label className="checkbox-field discovery-toggle"><input type="checkbox" checked={webSearchEnabled} onChange={(event) => setWebSearchEnabled(event.target.checked)} /><span>Search and extract the wider web</span></label><span className={webSearchConfigured ? "connection-status connected" : "connection-status"}>{webSearchConfigured ? "Provider pool secured" : "API key needed"}</span></div>
                <div className="discovery-schedule-grid">
                  <label><span>Maximum required experience</span><select value={maxRequiredYears} onChange={(event) => setMaxRequiredYears(Number(event.target.value))}><option value={0}>No professional experience</option><option value={1}>Up to 1 year</option><option value={2}>Up to 2 years</option></select></label>
                  <div className="provider-order-note"><strong>Automatic order</strong><small>Tavily → Exa → Firecrawl → Brave → SerpApi → Serper</small></div>
                </div>
                <div className="discovery-schedule-grid provider-key-grid">
                  <label><span>Tavily API key {settings?.discovery_tavily_configured ? "- saved" : ""}</span><input type="password" value={webSearchKey} onChange={(event) => setWebSearchKey(event.target.value)} autoComplete="off" placeholder={settings?.discovery_tavily_configured ? "Paste only to replace" : "tvly-..."} /></label>
                  <label><span>Exa API key {settings?.discovery_exa_configured ? "- saved" : ""}</span><input type="password" value={exaSearchKey} onChange={(event) => setExaSearchKey(event.target.value)} autoComplete="off" placeholder={settings?.discovery_exa_configured ? "Paste only to replace" : "Exa key"} /></label>
                  <label><span>Firecrawl API key {settings?.discovery_firecrawl_configured ? "- saved" : ""}</span><input type="password" value={firecrawlSearchKey} onChange={(event) => setFirecrawlSearchKey(event.target.value)} autoComplete="off" placeholder={settings?.discovery_firecrawl_configured ? "Paste only to replace" : "fc-..."} /></label>
                  <label><span>Brave Search API key {settings?.discovery_brave_configured ? "- saved" : ""}</span><input type="password" value={braveSearchKey} onChange={(event) => setBraveSearchKey(event.target.value)} autoComplete="off" placeholder={settings?.discovery_brave_configured ? "Paste only to replace" : "Brave key"} /></label>
                  <label><span>SerpApi key {settings?.discovery_serpapi_configured ? "- saved" : ""}</span><input type="password" value={serpApiSearchKey} onChange={(event) => setSerpApiSearchKey(event.target.value)} autoComplete="off" placeholder={settings?.discovery_serpapi_configured ? "Paste only to replace" : "SerpApi key"} /></label>
                  <label><span>Serper API key {settings?.discovery_serper_configured ? "- saved" : ""}</span><input type="password" value={serperSearchKey} onChange={(event) => setSerperSearchKey(event.target.value)} autoComplete="off" placeholder={settings?.discovery_serper_configured ? "Paste only to replace" : "Serper key"} /></label>
                </div>
                <div className="web-key-actions"><p>Paste any or all keys, then save once. Empty fields preserve previously saved keys. Every key is encrypted in Supabase Vault and is never returned to the browser.</p><div className="web-key-buttons"><button className="secondary-button" type="button" onClick={testSearchProviders} disabled={discoveryBusy || !webSearchConfigured}>Check key status</button><button className="secondary-button" type="button" onClick={saveWebSearchKey} disabled={discoveryBusy || ![webSearchKey, exaSearchKey, firecrawlSearchKey, braveSearchKey, serpApiSearchKey, serperSearchKey].some((key) => key.trim())}>{webSearchConfigured ? "Save or replace provider keys" : "Save provider keys"}</button></div></div>
                {settings?.discovery_provider_status?.length ? <div className="provider-health-grid" aria-label="Search provider status">{settings.discovery_provider_status.map((provider) => {
                  const httpOk = Boolean(provider.httpStatus && provider.httpStatus >= 200 && provider.httpStatus < 300);
                  const wasLastUsed = settings.discovery_last_provider === provider.provider;
                  return <div key={provider.provider} className={`provider-health ${httpOk ? "used" : provider.httpStatus ? "failed" : "skipped"}`}>
                    <div className="provider-health-heading">
                      <strong>{provider.provider.replace(/^./, (letter) => letter.toUpperCase())}</strong>
                      <div className="provider-health-badges">
                        <span className={`provider-http-status ${httpOk ? "ok" : provider.httpStatus ? "error" : "unavailable"}`}>{provider.httpStatus ? `HTTP ${provider.httpStatus}` : "No free check"}</span>
                        {wasLastUsed ? <span className="provider-last-used" title={settings.last_discovery_at ? `Last used ${new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: settings.discovery_timezone || "Asia/Singapore" }).format(new Date(settings.last_discovery_at))}` : "Most recently used provider"}>Last used</span> : null}
                      </div>
                    </div>
                    <small>{provider.reason}</small>
                  </div>;
                })}</div> : null}
                <label><span>Target role searches, one per line</span><textarea rows={5} value={webSearchQueries} onChange={(event) => setWebSearchQueries(event.target.value)} /><small>The saved location is added automatically. Two extra searches cover major ATS platforms and independent company career sites.</small></label>
                <div className="criteria-editor-grid">
                  <label><span>Accepted role keywords, one per line</span><textarea rows={8} value={targetRoleKeywords} onChange={(event) => setTargetRoleKeywords(event.target.value)} /><small>A listing title must match at least one of these terms.</small></label>
                  <label><span>Rejected title keywords, one per line</span><textarea rows={8} value={excludedTitleKeywords} onChange={(event) => setExcludedTitleKeywords(event.target.value)} /><small>Titles containing one of these terms are rejected before scoring.</small></label>
                </div>
                <p className="criteria-save-note">Manual edits become active only when you press Save discovery settings. Resume uploads create a separate proposal and never change active criteria automatically.</p>
                {settings?.discovery_criteria_suggestion_status === "pending" && settings.discovery_criteria_suggestion ? <article className="criteria-proposal">
                  <div className="criteria-proposal-heading"><div><small>Resume suggestion awaiting review</small><strong>Proposed scout criteria from {settings.discovery_criteria_suggestion_source_resume || "latest resume"}</strong></div><span>Not active</span></div>
                  <p>{settings.discovery_criteria_suggestion.rationale}</p>
                  <div className="criteria-proposal-grid">
                    <div><small>Searches</small><strong>{settings.discovery_criteria_suggestion.search_queries.length}</strong></div>
                    <div><small>Role keywords</small><strong>{settings.discovery_criteria_suggestion.target_role_keywords.length}</strong></div>
                    <div><small>Experience limit</small><strong>{settings.discovery_criteria_suggestion.max_required_years} year</strong></div>
                  </div>
                  {settings.discovery_criteria_suggestion.detected_skills.length ? <p className="criteria-skills">Detected evidence: {settings.discovery_criteria_suggestion.detected_skills.join(", ")}</p> : null}
                  <details><summary>Preview proposed searches and keywords</summary><p><strong>Searches:</strong> {settings.discovery_criteria_suggestion.search_queries.join("; ")}</p><p><strong>Role keywords:</strong> {settings.discovery_criteria_suggestion.target_role_keywords.join(", ")}</p></details>
                  <div className="criteria-proposal-actions"><button type="button" className="secondary-button" onClick={() => reviewCriteriaSuggestion("rejected")} disabled={discoveryBusy}>Keep current criteria</button><button type="button" className="primary-button compact" onClick={() => reviewCriteriaSuggestion("approved")} disabled={discoveryBusy}>Approve new criteria</button></div>
                </article> : null}
                <div className="personal-job-links"><div><strong>Personal job-board searches for {discoveryLocation}</strong><small>These open in your browser and use your existing login. The dashboard never stores your LinkedIn or Indeed password.</small></div><a className="secondary-button" href={linkedInJobSearch} target="_blank" rel="noreferrer">Open LinkedIn ↗</a><a className="secondary-button" href={indeedJobSearch} target="_blank" rel="noreferrer">Open Indeed ↗</a></div>
                <label className="checkbox-field discovery-toggle"><input type="checkbox" checked={sourceLearningEnabled} onChange={(event) => setSourceLearningEnabled(event.target.checked)} /><span>Learn reusable sources from strong web matches</span></label>
                <label><span>Reliable direct Greenhouse or Lever feeds</span><textarea rows={5} value={discoverySources} onChange={(event) => setDiscoverySources(event.target.value)} placeholder={"https://boards.greenhouse.io/company\nhttps://jobs.lever.co/company"} /><small>These feeds supplement web search. When learning is enabled, a Greenhouse or Lever employer producing an 80+ match is added automatically. Workday and other portals remain covered through fresh web search.</small></label>
                {settings?.discovery_learned_sources?.length ? <div className="learned-source-panel"><div><strong>Learned source quality</strong><small>{settings.discovery_learned_sources.length} web source{settings.discovery_learned_sources.length === 1 ? "" : "s"} produced an 80+ match</small></div><div className="learned-source-list">{settings.discovery_learned_sources.slice(0, 8).map((source) => <span key={`${source.host}-${source.company}`} title={`${source.matches} strong match${source.matches === 1 ? "" : "es"} · best ${source.bestScore}`}><b>{source.company}</b><small>{source.atsPlatform} · {source.bestScore}{source.promoted ? " · direct feed added" : " · web monitored"}</small></span>)}</div></div> : null}
                <div className="discovery-actions"><button className="secondary-button" type="submit" disabled={discoveryBusy}>{discoveryBusy ? "Saving..." : "Save discovery settings"}</button><button className="primary-button compact" type="button" onClick={fetchJobsNow} disabled={discoveryBusy || (!normalizedDiscoverySources().length && !webSearchConfigured)}>{discoveryBusy ? "Fetching..." : "Fetch now"}</button></div>
              </form>
              {settings?.discovery_last_credit_limit ? <p className="connection-detail">Tavily usage: {settings.discovery_last_credit_usage ?? 0} of {Math.min(settings.discovery_last_credit_limit, settings.discovery_monthly_credit_cap ?? 900)} allowed credits this month. When the safety ceiling is reached, the next configured provider takes over.</p> : null}
              {settings?.discovery_last_provider ? <p className="connection-detail">Last web provider used: <strong>{settings.discovery_last_provider.replace(/^./, (letter) => letter.toUpperCase())}</strong>.</p> : null}
              <p className="connection-detail">{settings?.last_discovery_at ? `Last run: ${new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: settings.discovery_timezone || "Asia/Singapore" }).format(new Date(settings.last_discovery_at))}. ${settings.discovery_message || ""}` : settings?.discovery_message || "No live discovery run yet. Existing prepared records will remain until you delete them."}</p>
              {discoveryMessage ? <p className="discovery-message" role="status">{discoveryMessage}</p> : null}
            </section>

            <section className="security-panel document-provider-panel">
              <div className="security-heading"><div><p>Document provider</p><h3>On-demand resume tailoring</h3></div><span className={settings?.document_provider_configured ? "connection-status connected" : "connection-status"}>{settings?.document_provider_configured ? "Vault secured" : "Not configured"}</span></div>
              <p className="security-copy">Your key is sent directly to encrypted Supabase Vault only after you confirm. It is never displayed again or stored in the browser. Generation runs only when you press Generate for a job.</p>
              <form className="provider-form" onSubmit={saveDocumentProvider}>
                <div className="provider-grid">
                  <label><span>Provider</span><select value={documentProvider} onChange={(event) => {
                    const provider = event.target.value as "gemini" | "openai_compatible";
                    setDocumentProvider(provider);
                    if (provider === "gemini" && !documentModel.trim()) setDocumentModel("gemini-3.6-flash");
                  }}><option value="gemini">Google Gemini</option><option value="openai_compatible">OpenAI-compatible endpoint</option></select></label>
                  <label><span>Model</span><input value={documentModel} onChange={(event) => setDocumentModel(event.target.value)} placeholder={documentProvider === "gemini" ? "gemini-3.6-flash" : "Provider model name"} required /></label>
                </div>
                {documentProvider === "openai_compatible" ? <label><span>Chat-completions endpoint</span><input type="url" value={documentEndpoint} onChange={(event) => setDocumentEndpoint(event.target.value)} placeholder="https://provider.example/v1/chat/completions" required /></label> : null}
                <label><span>{settings?.document_provider_configured ? "Replacement API key" : "API key"}</span><input type="password" value={documentKey} onChange={(event) => setDocumentKey(event.target.value)} autoComplete="off" placeholder="Paste the key, then confirm" required /></label>
                <div className="provider-actions"><button className="primary-button compact" disabled={documentProviderBusy}>{documentProviderBusy ? "Saving..." : settings?.document_provider_configured ? "Replace provider key" : "Confirm and save key"}</button>{settings?.document_provider_configured ? <button type="button" className="secondary-button" onClick={clearDocumentProvider} disabled={documentProviderBusy}>Remove key</button> : null}</div>
              </form>
              <p className="connection-detail">Gemini works with its API key and model. To change to another service, choose the custom option and provide that service&apos;s HTTPS endpoint, model, and key. Provider keys are not interchangeable.</p>
              {documentProviderMessage ? <p className="discovery-message" role="status">{documentProviderMessage}</p> : null}
            </section>

            <section className="security-panel">
              <div className="security-heading"><div><p>Account credentials</p><h3>Change email or password</h3></div></div>
              <p className="security-copy">Email changes require confirmation. Your administrator access follows the same account, so changing the address will not disconnect your data.</p>
              <form className="credential-form" onSubmit={updateEmail}>
                <label><span>Sign-in email</span><input type="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} autoComplete="email" required /></label>
                <button className="secondary-button" disabled={securityBusy}>Update email</button>
              </form>
              <form className="credential-form password-grid" onSubmit={updatePassword}>
                <label><span>Current password</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
                <label><span>New password</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={12} required /></label>
                <label><span>Confirm new password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={12} required /></label>
                <button className="primary-button compact" disabled={securityBusy}>Update password</button>
              </form>
            </section>

            <section className="security-panel">
              <div className="security-heading"><div><p>Passkey authentication</p><h3>Phishing-resistant sign-in</h3></div><button className="primary-button compact" onClick={registerPasskey} disabled={securityBusy}>Add passkey</button></div>
              <p className="security-copy">Register Face ID, Touch ID, Windows Hello, a password manager, or a hardware security key. Keep your password for recovery.</p>
              <div className="credential-list">
                {passkeys.length ? passkeys.map((passkey) => (
                  <div key={passkey.id}><span>◉</span><p><strong>{passkey.friendly_name || "Passkey"}</strong><small>Added {new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(passkey.created_at))}</small></p><button onClick={() => deletePasskey(passkey.id)} disabled={securityBusy}>Remove</button></div>
                )) : <div className="credential-empty"><span>○</span><p><strong>No passkey registered yet</strong><small>Add one after your email is confirmed.</small></p></div>}
              </div>
            </section>

            <section className="security-panel">
              <div className="security-heading"><div><p>Display preferences</p><h3>Dashboard text size</h3></div><span className="connection-status connected">{TEXT_SIZE_OPTIONS.find((option) => option.value === textSize)?.label}</span></div>
              <p className="security-copy">Increase dashboard text without changing the number of jobs shown or the responsive mobile layout. This preference is saved only in this browser.</p>
              <div className="text-size-control" role="group" aria-label="Dashboard text size">
                {TEXT_SIZE_OPTIONS.map((option) => <button type="button" key={option.value} className={textSize === option.value ? "active" : ""} aria-pressed={textSize === option.value} onClick={() => changeTextSize(option.value)}>{option.label}</button>)}
              </div>
            </section>

            <section className="security-panel">
              <div className="security-heading"><div><p>Session protection</p><h3>Automatic inactivity timeout</h3></div><span className="connection-status connected">Active</span></div>
              <p className="security-copy">The current browser signs out after the selected period without clicks, taps, or keyboard activity. Other active devices keep their own session timer.</p>
              <form className="session-timeout-form" onSubmit={saveSessionTimeout}>
                <label><span>Sign out after</span><select value={sessionTimeoutMinutes} onChange={(event) => setSessionTimeoutMinutes(Number(event.target.value))}>{SESSION_TIMEOUT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} of inactivity</option>)}</select></label>
                <button className="secondary-button" disabled={securityBusy}>Save timeout</button>
              </form>
              {sessionMessage ? <p className="discovery-message" role="status">{sessionMessage}</p> : null}
            </section>

            <section className="security-panel">
              <div className="security-heading"><div><p>Optional backup</p><h3>Notion Applications backup</h3></div><span className={settings?.notion_connected ? "connection-status connected" : "connection-status"}>{settings?.notion_connected ? "Ready" : "Not configured"}</span></div>
              <p className="security-copy">Supabase is your live database. Connect Notion only if you want an additional backup copy. Normal editing and tracking stay inside this website.</p>
              <form className="connection-form" onSubmit={connectNotion}>
                <input type="password" value={notionToken} onChange={(event) => setNotionToken(event.target.value)} placeholder="Paste Notion integration token" autoComplete="off" aria-label="Notion integration token" />
                <button className="primary-button compact" disabled={securityBusy}>Save backup connection</button>
              </form>
              <div className="connection-actions">
                <button className="secondary-button" onClick={backupToNotion} disabled={securityBusy || !settings?.notion_connected}>Back up now</button>
                <a className="secondary-button" href={notionHub} target="_blank" rel="noreferrer">View backup ↗</a>
              </div>
              <p className="connection-detail">{settings?.last_backup_at ? `Last backup: ${new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(settings.last_backup_at))}` : settings?.backup_message || "Notion is optional. If you enable it, share the Applications database with your integration once."}</p>
            </section>

            {connectionMessage ? <p className="security-message" role="status">{connectionMessage}</p> : null}
            <div className="security-footer"><span>Supabase Auth • RLS • encrypted Vault</span><button onClick={signOut}>Sign out</button></div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
