"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const ADMIN_EMAIL = "ledonguyentu@gmail.com";
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
  const [mode, setMode] = useState<"signin" | "setup">("signin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const passkeySupported = typeof window !== "undefined" && "PublicKeyCredential" in window;

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (mode === "setup" && password.length < 12) {
      setError("Use at least 12 characters for the administrator password.");
      return;
    }

    setBusy(true);
    if (mode === "setup") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: ADMIN_EMAIL,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (signUpError) setError(signUpError.message);
      else if (data.session) onAuthenticated();
      else setMessage(`A confirmation link was sent to ${ADMIN_EMAIL}. Open it, then return here to sign in.`);
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password,
      });
      if (signInError) setError(signInError.message);
      else onAuthenticated();
    }
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
        <h1 id="auth-title">{mode === "signin" ? "Welcome back, Brian." : "Create your admin account."}</h1>
        <p className="auth-copy">Only the confirmed administrator account can access this private dashboard and its data.</p>

        <form className="auth-form" onSubmit={submitPassword}>
          <label><span>Administrator email</span><input type="email" value={ADMIN_EMAIL} readOnly /></label>
          <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder="Enter your private password" required /></label>
          {error ? <p className="auth-message error" role="alert">{error}</p> : null}
          {message ? <p className="auth-message success" role="status">{message}</p> : null}
          <button className="primary-button auth-primary" disabled={busy}>{busy ? "Please wait" : mode === "signin" ? "Sign in securely" : "Create admin account"}</button>
        </form>

        <div className="auth-divider"><span>or</span></div>
        <button className="passkey-button" onClick={signInWithPasskey} disabled={busy || !passkeySupported}><span>◎</span> Sign in with a passkey</button>
        {!passkeySupported ? <p className="auth-hint">This browser does not support passkeys.</p> : <p className="auth-hint">Passkey sign-in works after you register one from Security and connections.</p>}

        <button className="auth-mode" onClick={() => { setMode((value) => value === "signin" ? "setup" : "signin"); setError(""); setMessage(""); }}>
          {mode === "signin" ? "First visit? Create the admin account" : "Already created it? Sign in"}
        </button>
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
  const [notionToken, setNotionToken] = useState("");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);
  const [passkeys, setPasskeys] = useState<Array<{ id: string; friendly_name?: string; created_at: string }>>([]);
  const [currentDate] = useState(() => new Date());
  const searchRef = useRef<HTMLInputElement>(null);

  const loadDashboard = useCallback(async () => {
    setDataLoading(true);
    setDataError("");
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase();
    if (userError || !userData.user) {
      setAuthPhase("signed_out");
      setDataLoading(false);
      return;
    }
    if (email !== ADMIN_EMAIL) {
      setAuthPhase("denied");
      setDataLoading(false);
      return;
    }

    const { data: isAdmin, error: adminError } = await supabase.rpc("is_current_admin");
    if (adminError || isAdmin !== true) {
      setAuthPhase("denied");
      setDataLoading(false);
      return;
    }

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
    await refreshPasskeys();
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

  const syncNotion = async () => {
    setSecurityBusy(true);
    setConnectionMessage("Synchronizing the live Notion tracker...");
    const { data, error } = await supabase.functions.invoke("sync-notion", { body: {} });
    if (error) setConnectionMessage(error.message);
    else {
      const count = typeof data?.synced === "number" ? data.synced : 0;
      setConnectionMessage(`${count} Notion records synchronized.`);
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
    setConnectionMessage("Notion connection saved securely. Starting the first sync...");
    setSecurityBusy(false);
    await syncNotion();
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
    return <main className="auth-shell"><section className="auth-card denied-card"><p className="eyebrow">Access denied</p><h1>This account is not authorized.</h1><p className="auth-copy">Only {ADMIN_EMAIL} can open this dashboard.</p><button className="primary-button auth-primary" onClick={signOut}>Sign out</button></section></main>;
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
          <a className="notion-link" href={notionHub} target="_blank" rel="noreferrer">Open Notion <span>↗</span></a>
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
            <article className="stat-card"><div className="stat-top"><span className="stat-icon green-icon">↻</span><span className={settings?.notion_connected ? "live-label" : "muted-label"}><i /> {settings?.notion_connected ? "Connected" : "Setup needed"}</span></div><strong className="time-stat">08:00</strong><p>Daily scout</p></article>
          </section>

          <section className="focus-grid">
            <article className="focus-card">
              <div className="focus-copy">
                <div className="section-kicker"><span>Top opportunity</span><span className="fresh-pill">{topJob?.found || "Waiting"}</span></div>
                <p className="company-name">{topJob?.company.toUpperCase() || "LIVE PIPELINE"}</p>
                <h2>{topJob?.role || "Connect Notion to load opportunities"}</h2>
                <p className="focus-description">{topJob?.note || "Your private Supabase database is ready for live job records."}</p>
                <div className="focus-tags">{topJob?.tags.length ? topJob.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>No skills loaded yet</span>}</div>
                <div className="focus-actions">
                  <button className="primary-button" disabled={!topJob} onClick={() => topJob && setSelectedJob(topJob)}>Review match</button>
                  <button className="secondary-button" disabled={!topJob} onClick={() => topJob && toggleSave(topJob.id)}>{topJob && saved.includes(topJob.id) ? "Saved" : "Save role"}</button>
                </div>
              </div>
              <div className="focus-visual" aria-label={`${topJob?.score || 0} percent match`}>
                <div className="orbital orbital-one" /><div className="orbital orbital-two" />
                <div className="hero-score"><span>AI MATCH</span><strong>{topJob?.score || 0}</strong><small>out of 100</small></div>
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
              <a href={notionHub} target="_blank" rel="noreferrer" className="text-link">Live tracker in Notion <span>↗</span></a>
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
                    <a href={resume.notion_url || notionHub} target="_blank" rel="noreferrer" className="resume-open" aria-label={`Edit ${resume.name} resume in Notion`}>↗</a>
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
              <div className="owner-lock"><span>●</span> Confirmed admin only</div>
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
                <a className="profile-link" href={profile?.notion_url || notionHub} target="_blank" rel="noreferrer">Open editable private profile in Notion <span>↗</span></a>
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

          <footer><p>Notion is the live source of truth. Supabase stores the protected dashboard and synchronization state.</p><span>Private • Admin-only access</span></footer>
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
            <a className="primary-button full" href={selectedJob.notionUrl || selectedJob.jobUrl || notionHub} target="_blank" rel="noreferrer">Open live job record <span>↗</span></a>
            <p className="approval-note">No application is submitted without your approval.</p>
          </section>
        </div>
      ) : null}

      {securityOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSecurityOpen(false)}>
          <section className="security-modal" role="dialog" aria-modal="true" aria-labelledby="security-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSecurityOpen(false)} aria-label="Close security and connections">×</button>
            <p className="eyebrow">Private administration</p>
            <h2 id="security-title">Security and connections</h2>
            <p className="security-intro">Manage passkeys, the live Notion connection, and your administrator session.</p>

            <div className="security-account">
              <span className="security-icon">◎</span>
              <div><small>Authorized administrator</small><strong>{ADMIN_EMAIL}</strong></div>
              <span className="verified-badge">Verified only</span>
            </div>

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
              <div className="security-heading"><div><p>Live data source</p><h3>Notion Applications tracker</h3></div><span className={settings?.notion_connected ? "connection-status connected" : "connection-status"}>{settings?.notion_connected ? "Connected" : "Not connected"}</span></div>
              <p className="security-copy">Enter the Notion integration token here, never in chat. It is encrypted in Supabase Vault and used only by the protected synchronization function.</p>
              <form className="connection-form" onSubmit={connectNotion}>
                <input type="password" value={notionToken} onChange={(event) => setNotionToken(event.target.value)} placeholder="Paste Notion integration token" autoComplete="off" aria-label="Notion integration token" />
                <button className="primary-button compact" disabled={securityBusy}>Save connection</button>
              </form>
              <div className="connection-actions">
                <button className="secondary-button" onClick={syncNotion} disabled={securityBusy || !settings?.notion_connected}>Sync now</button>
                <a className="secondary-button" href={notionHub} target="_blank" rel="noreferrer">Open Notion ↗</a>
              </div>
              <p className="connection-detail">{settings?.last_notion_sync ? `Last sync: ${new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(settings.last_notion_sync))}` : settings?.last_sync_message || "Share the Applications database with your Notion integration before the first sync."}</p>
            </section>

            {connectionMessage ? <p className="security-message" role="status">{connectionMessage}</p> : null}
            <div className="security-footer"><span>Supabase Auth • RLS • encrypted Vault</span><button onClick={signOut}>Sign out</button></div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
