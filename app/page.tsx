"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const FALLBACK_NOTION_HUB =
  "https://app.notion.com/p/cf3a242773ef4ce686fde98a41e8f63f";
const MOM_S_PASS =
  "https://www.mom.gov.sg/passes-and-permits/s-pass/eligibility";

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
};

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

function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const passkeySupported = typeof window !== "undefined" && "PublicKeyCredential" in window;

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!email.trim()) {
      setError("Enter your administrator email address.");
      return;
    }

    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (signInError) setError(signInError.message);
    else onAuthenticated();
    setBusy(false);
  };

  const resetPassword = async () => {
    setError("");
    setMessage("");
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    });
    if (resetError) setError(resetError.message);
    else setMessage("Password reset instructions were sent if this email belongs to the administrator account.");
    setBusy(false);
  };

  const signInWithPasskey = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    const { error: passkeyError } = await supabase.auth.signInWithPasskey();
    if (passkeyError) setError(passkeyError.message);
    else onAuthenticated();
    setBusy(false);
  };

  return (
    <main className="auth-shell">
      <div className="auth-aurora auth-aurora-one" /><div className="auth-aurora auth-aurora-two" />
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><span className="brand-mark">B</span><div><strong>BRIAN</strong><small>Job Command Center</small></div></div>
        <div className="auth-lock">Private admin portal</div>
        <p className="eyebrow">Supabase protected</p>
        <h1 id="auth-title">Welcome back.</h1>
        <p className="auth-copy">Enter the administrator account credentials to open the private dashboard.</p>

        <form className="auth-form" onSubmit={submitPassword}>
          <label><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required /></label>
          <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Enter your private password" required /></label>
          {error ? <p className="auth-message error" role="alert">{error}</p> : null}
          {message ? <p className="auth-message success" role="status">{message}</p> : null}
          <button className="primary-button auth-primary" disabled={busy}>{busy ? "Please wait" : "Sign in securely"}</button>
        </form>

        <div className="auth-divider"><span>or</span></div>
        <button className="passkey-button" onClick={signInWithPasskey} disabled={busy || !passkeySupported}><span>◎</span> Sign in with a passkey</button>
        {!passkeySupported ? <p className="auth-hint">This browser does not support passkeys.</p> : <p className="auth-hint">Passkey sign-in works after you register one from Security and connections.</p>}

        <button className="auth-mode" onClick={resetPassword} disabled={busy}>Forgot password?</button>
        <div className="auth-trust"><span>Encrypted database</span><span>Row-level security</span><span>Independent login</span></div>
      </section>
    </main>
  );
}

const navItems = ["Overview", "Pipeline", "Resumes", "Profile"];

function JobCard({
  job,
  saved,
  onSave,
  onOpen,
}: {
  job: Job;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="job-card">
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
        <div className="job-footer">
          <div className="status-group">
            <span className={`match-pill ${job.match.toLowerCase()}`}>{job.match}</span>
            <span className="sponsor-pill unknown">Sponsorship {job.sponsorship.toLowerCase()}</span>
          </div>
          <button className="text-button" onClick={onOpen}>Review details <span aria-hidden="true">↗</span></button>
        </div>
      </div>
      <div className={`score-ring score-${job.match.toLowerCase()}`}>
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
  const [dark, setDark] = useState(true);
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
  const [passkeys, setPasskeys] = useState<Array<{ id: string; friendly_name?: string; created_at: string }>>([]);
  const [jobEditorOpen, setJobEditorOpen] = useState(false);
  const [jobDraft, setJobDraft] = useState<JobDraft>(EMPTY_JOB);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<PrivateProfile | null>(null);
  const [resumeEditorOpen, setResumeEditorOpen] = useState(false);
  const [resumeDraft, setResumeDraft] = useState<Resume | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorMessage, setEditorMessage] = useState("");
  const [currentDate] = useState(() => new Date());
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
      supabase.from("resumes").select("*").order("sort_order", { ascending: true }),
      supabase.from("private_profile").select("*").eq("id", 1).single(),
      supabase.from("app_settings").select("*").eq("id", 1).single(),
    ]);

    const firstError = jobsResult.error || resumesResult.error || profileResult.error || settingsResult.error;
    if (firstError) {
      setDataError(firstError.message);
    } else {
      const rows = (jobsResult.data ?? []) as JobRow[];
      setJobs(rows.map(mapJob));
      setSaved(rows.filter((job) => job.saved).map((job) => Number(job.id)));
      setResumes((resumesResult.data ?? []) as Resume[]);
      setProfile(profileResult.data as PrivateProfile);
      setSettings(settingsResult.data as AppSettings);
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

  const filteredJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesFilter = filter === "All" || job.match === filter;
      const haystack = `${job.company} ${job.role} ${job.track} ${job.tags.join(" ")}`.toLowerCase();
      return matchesFilter && (!normalized || haystack.includes(normalized));
    });
  }, [filter, query, jobs]);

  const scrollTo = (label: string) => {
    document.getElementById(label.toLowerCase())?.scrollIntoView({ behavior: "smooth" });
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

  const salary = salaryEra === "2026"
    ? financialSector ? 3800 : 3300
    : financialSector ? 4000 : 3600;

  const copySalary = async () => {
    await navigator.clipboard.writeText(`S$${salary.toLocaleString()} fixed monthly salary`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
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
    setResumeFile(null);
    setEditorMessage("");
    setResumeEditorOpen(true);
  };

  const downloadResume = async (resume: Resume) => {
    if (!resume.storage_path) return;
    setDataError("");
    const { data, error } = await supabase.storage.from("resume-files").createSignedUrl(resume.storage_path, 60);
    if (error || !data?.signedUrl) {
      setDataError(error?.message || "The resume file could not be opened.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const saveResume = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resumeDraft) return;
    setEditorBusy(true);
    setEditorMessage("");
    let storagePath = resumeDraft.storage_path || null;
    let originalFilename = resumeDraft.original_filename || null;

    if (resumeFile) {
      const safeFilename = resumeFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const nextPath = `${resumeDraft.code}/${Date.now()}-${safeFilename}`;
      const { error: uploadError } = await supabase.storage.from("resume-files").upload(nextPath, resumeFile, {
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) {
        setEditorMessage(uploadError.message);
        setEditorBusy(false);
        return;
      }
      storagePath = nextPath;
      originalFilename = resumeFile.name;
    }

    const { error } = await supabase.from("resumes").update({
      name: resumeDraft.name.trim(),
      fit: resumeDraft.fit.trim(),
      recommendation: resumeDraft.recommendation.trim(),
      storage_path: storagePath,
      original_filename: originalFilename,
      updated_at: new Date().toISOString(),
    }).eq("code", resumeDraft.code);
    if (error) {
      if (resumeFile && storagePath) await supabase.storage.from("resume-files").remove([storagePath]);
      setEditorMessage(error.message);
    }
    else {
      if (resumeFile && resumeDraft.storage_path && resumeDraft.storage_path !== storagePath) {
        await supabase.storage.from("resume-files").remove([resumeDraft.storage_path]);
      }
      setResumeEditorOpen(false);
      setResumeFile(null);
      await loadDashboard();
    }
    setEditorBusy(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSecurityOpen(false);
    setAuthPhase("signed_out");
  };

  if (authPhase === "checking") {
    return <main className="auth-shell"><div className="auth-loading"><span className="brand-mark">B</span><p>Opening your private command center...</p></div></main>;
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
  const daysToAvailability = profile?.available_from
    ? Math.max(0, Math.ceil((new Date(`${profile.available_from}T00:00:00+08:00`).getTime() - currentDate.getTime()) / 86_400_000))
    : 0;

  return (
    <main className={dark ? "app-shell dark" : "app-shell light"}>
      <div className="aurora aurora-one" /><div className="aurora aurora-two" />

      <aside className="sidebar">
        <button className="brand" onClick={() => scrollTo("Overview")}>
          <span className="brand-mark">B</span>
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
          <div className="mobile-brand"><span className="brand-mark">B</span><strong>Job OS</strong></div>
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search jobs, companies, skills" aria-label="Search jobs" />
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
              <p className="eyebrow">{todayLabel}</p>
              <h1>Good morning, Brian.</h1>
              <p className="subcopy">{dataLoading ? "Refreshing your private workspace..." : `${jobs.length} opportunities tracked. ${strongCount} strong ${strongCount === 1 ? "match is" : "matches are"} ready for review.`}</p>
            </div>
            <div className="secure-chip"><span aria-hidden="true">◉</span> Supabase admin session</div>
          </section>

          <section className="stats-grid" aria-label="Application summary">
            <article className="stat-card featured"><div className="stat-top"><span className="stat-icon">✦</span><span className="trend">Live score</span></div><strong>{strongCount}</strong><p>Strong {strongCount === 1 ? "match" : "matches"}</p></article>
            <article className="stat-card"><div className="stat-top"><span className="stat-icon cyan-icon">◫</span><span className="muted-label">Needs you</span></div><strong>{reviewCount}</strong><p>Review queue</p></article>
            <article className="stat-card"><div className="stat-top"><span className="stat-icon amber-icon">!</span><span className="muted-label">Filtered safely</span></div><strong>{blockedCount}</strong><p>Blocked roles</p></article>
            <article className="stat-card"><div className="stat-top"><span className="stat-icon green-icon">↻</span><span className="live-label"><i /> Live</span></div><strong className="time-stat">{jobs.length}</strong><p>Supabase records</p></article>
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
                  <button className="primary-button" disabled={!topJob} onClick={() => topJob && setSelectedJob(topJob)}>Review match</button>
                  <button className="secondary-button" disabled={!topJob} onClick={() => topJob && toggleSave(topJob.id)}>{topJob && saved.includes(topJob.id) ? "Saved" : "Save role"}</button>
                </div>
              </div>
              <div className="focus-visual" aria-label={`${topJob?.score || 0} percent match`}>
                <div className="orbital orbital-one" /><div className="orbital orbital-two" />
                <div className="hero-score"><span>FIT SCORE</span><strong>{topJob?.score || 0}</strong><small>out of 100</small></div>
                <div className="fit-chip fit-one">{topJob?.track || "Role fit"}</div><div className="fit-chip fit-two">{topJob?.match || "Pending"}</div><div className="risk-chip">Sponsorship {topJob?.sponsorship.toLowerCase() || "unknown"}</div>
              </div>
            </article>

            <aside className="scout-card">
              <div className="scout-header"><div className="pulse-mark"><span /></div><div><p>Job Match Scout</p><strong>Active</strong></div><span className="on-switch"><i /></span></div>
              <div className="scan-visual"><span className="scan-line" /><div className="scan-core">⌕</div></div>
              <div className="scan-stats"><div><strong>8</strong><span>sources</span></div><div><strong>{jobs.length}</strong><span>roles found</span></div><div><strong>{strongCount}</strong><span>strong fit</span></div></div>
              <p className="next-scan">Next scan tomorrow at 8:00 AM</p>
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
                  <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)} role="tab" aria-selected={filter === item}>
                    {item}<span>{item === "All" ? jobs.length : jobs.filter((job) => job.match === item).length}</span>
                  </button>
                ))}
              </div>
              <p>{filteredJobs.length} visible</p>
            </div>
            <div className="job-list">
              {filteredJobs.length ? filteredJobs.map((job) => (
                <JobCard key={job.id} job={job} saved={saved.includes(job.id)} onSave={() => toggleSave(job.id)} onOpen={() => setSelectedJob(job)} />
              )) : (
                <div className="empty-state"><span>⌕</span><h3>No matching jobs</h3><p>Try a different search or pipeline filter.</p></div>
              )}
            </div>
          </section>

          <section id="resumes" className="resumes-section">
            <div className="section-heading">
              <div><p className="eyebrow">Document intelligence</p><h2>Resume command center</h2></div>
              <p className="section-note">Three editable masters. Tailoring uses verified facts only.</p>
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
                      {resume.storage_path ? <button className="resume-open" onClick={() => downloadResume(resume)} aria-label={`Download ${resume.name} resume`}>↓</button> : null}
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

          <footer><p>Supabase is the live source of truth. Notion is an optional backup you control.</p><span>Private • Admin-only access</span></footer>
        </div>
      </section>

      {selectedJob ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedJob(null)}>
          <section className="job-modal" role="dialog" aria-modal="true" aria-labelledby="job-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedJob(null)} aria-label="Close details">×</button>
            <div className={`company-mark large ${selectedJob.tone}`}>{selectedJob.initials}</div>
            <p className="company-name">{selectedJob.company}</p><h2 id="job-modal-title">{selectedJob.role}</h2>
            <div className="modal-score-row"><span className={`match-pill ${selectedJob.match.toLowerCase()}`}>{selectedJob.match}</span><strong>{selectedJob.score}/100 match</strong></div>
            <p className="modal-note">{selectedJob.note}</p>
            <div className="modal-checks">
              <div><span>✓</span><p><strong>Role level</strong>Graduate or entry-level scope</p></div>
              <div><span>✓</span><p><strong>Location</strong>Singapore</p></div>
              <div className={selectedJob.match === "Blocked" ? "warning" : ""}><span>{selectedJob.match === "Blocked" ? "!" : "?"}</span><p><strong>Next check</strong>{selectedJob.match === "Blocked" ? "Language requirement blocks this role" : "Confirm employer sponsorship"}</p></div>
            </div>
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
                <label><span>Pipeline status</span><select value={jobDraft.pipeline} onChange={(event) => setJobDraft({ ...jobDraft, pipeline: event.target.value })}><option>Discovered</option><option>Review</option><option>Preparing</option><option>Applied</option><option>Interview</option><option>Offer</option><option>Rejected</option><option>Blocked</option></select></label>
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
              <label className="file-field"><span>Resume document</span><input type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setResumeFile(event.target.files?.[0] || null)} /></label>
              <p className="editor-note">{resumeFile ? `${resumeFile.name} will replace the current file.` : resumeDraft.original_filename ? `Current private file: ${resumeDraft.original_filename}` : "Upload an editable DOCX or a PDF. Files stay private and require your administrator session."}</p>
              {editorMessage ? <p className="editor-message">{editorMessage}</p> : null}
              <div className="editor-actions"><span />{resumeDraft.storage_path ? <button type="button" className="secondary-button" onClick={() => downloadResume(resumeDraft)}>Download current</button> : null}<button type="button" className="secondary-button" onClick={() => setResumeEditorOpen(false)}>Cancel</button><button className="primary-button" disabled={editorBusy}>{editorBusy ? "Saving..." : "Save resume"}</button></div>
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
            <p className="security-intro">Manage your sign-in credentials, passkeys, optional backup, and administrator session.</p>

            <div className="security-account">
              <span className="security-icon">◎</span>
              <div><small>Authorized administrator</small><strong>{currentUserEmail}</strong></div>
              <span className="verified-badge">Verified only</span>
            </div>

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
