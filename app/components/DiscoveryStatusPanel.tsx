"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./discovery-status.module.css";

const MARKETS = [
  { code: "SG", label: "Singapore" },
  { code: "VN", label: "Vietnam" },
  { code: "MY", label: "Malaysia" },
  { code: "TH", label: "Thailand" },
  { code: "ID", label: "Indonesia" },
  { code: "PH", label: "Philippines" },
] as const;

type MarketCode = typeof MARKETS[number]["code"];

type SourceHealth = {
  id: string;
  display_name: string;
  provider: string;
  adapter: string;
  market_codes: string[];
  trust_level: string;
  enabled: boolean;
  last_success_at: string | null;
  next_crawl_at: string;
  consecutive_failures: number;
  last_error_summary: string | null;
};

type DiscoveryRun = {
  id: number;
  status: string;
  started_at: string;
  finished_at: string | null;
  sources_attempted: number;
  sources_succeeded: number;
  sources_failed: number;
  verified_open: number;
  inserted: number;
  refreshed: number;
  closed: number;
  quarantined: number;
  sources_learned: number;
};

type VerifiedJob = {
  id: number;
  company: string;
  position: string;
  market_code: string | null;
  source_trust: string | null;
  ats_platform: string | null;
  posted_at: string | null;
  first_seen_at: string | null;
  last_verified_at: string | null;
  availability_status: string | null;
};

const formatDate = (value: string | null, includeTime = false) => {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-SG", includeTime
    ? { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }
    : { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(new Date(value));
};

export default function DiscoveryStatusPanel() {
  const [authorized, setAuthorized] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [markets, setMarkets] = useState<MarketCode[]>(["SG"]);
  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [latestRun, setLatestRun] = useState<DiscoveryRun | null>(null);
  const [quarantineCount, setQuarantineCount] = useState(0);
  const [verifiedJobs, setVerifiedJobs] = useState<VerifiedJob[]>([]);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [clockNow, setClockNow] = useState(0);

  const load = useCallback(async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setAuthorized(false);
      return;
    }
    const { data: isAdmin, error: adminError } = await supabase.rpc("is_current_admin");
    if (adminError || isAdmin !== true) {
      setAuthorized(false);
      return;
    }

    setAuthorized(true);
    setLoading(true);
    const [settingsResult, sourceResult, runResult, quarantineResult, jobsResult] = await Promise.all([
      supabase.from("app_settings").select("discovery_markets").eq("id", 1).single(),
      supabase.from("discovery_sources")
        .select("id, display_name, provider, adapter, market_codes, trust_level, enabled, last_success_at, next_crawl_at, consecutive_failures, last_error_summary")
        .order("display_name", { ascending: true }),
      supabase.from("discovery_runs")
        .select("id, status, started_at, finished_at, sources_attempted, sources_succeeded, sources_failed, verified_open, inserted, refreshed, closed, quarantined, sources_learned")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("discovery_quarantine").select("id", { count: "exact", head: true }),
      supabase.from("jobs")
        .select("id, company, position, market_code, source_trust, ats_platform, posted_at, first_seen_at, last_verified_at, availability_status", { count: "exact" })
        .not("source_id", "is", null)
        .eq("pipeline", "Discovered")
        .eq("availability_status", "verified_open")
        .in("source_trust", ["official", "verified_board"])
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(5),
    ]);

    const firstError = settingsResult.error || sourceResult.error || runResult.error || quarantineResult.error || jobsResult.error;
    if (firstError) {
      setMessage(firstError.message);
    } else {
      const configuredMarkets = Array.isArray(settingsResult.data?.discovery_markets)
        ? settingsResult.data.discovery_markets.filter((value: string): value is MarketCode => MARKETS.some((market) => market.code === value))
        : [];
      setMarkets(configuredMarkets.length ? configuredMarkets : ["SG"]);
      setSources((sourceResult.data ?? []) as SourceHealth[]);
      setLatestRun((runResult.data ?? null) as DiscoveryRun | null);
      setQuarantineCount(quarantineResult.count ?? 0);
      setVerifiedJobs((jobsResult.data ?? []) as VerifiedJob[]);
      setVerifiedCount(jobsResult.count ?? 0);
      setMessage("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const initialClock = window.setTimeout(() => setClockNow(Date.now()), 0);
    const clock = window.setInterval(() => setClockNow(Date.now()), 30_000);
    const { data } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => void load(), 0);
    });
    return () => {
      window.clearTimeout(initialLoad);
      window.clearTimeout(initialClock);
      window.clearInterval(clock);
      data.subscription.unsubscribe();
    };
  }, [load]);

  const healthyCount = useMemo(() => sources.filter((source) => source.enabled && source.last_success_at && source.consecutive_failures === 0).length, [sources]);
  const failingCount = useMemo(() => sources.filter((source) => source.enabled && source.consecutive_failures > 0).length, [sources]);
  const dueCount = useMemo(() => sources.filter((source) => source.enabled && clockNow > 0 && Date.parse(source.next_crawl_at) <= clockNow).length, [clockNow, sources]);

  const toggleMarket = (code: MarketCode) => {
    setMarkets((current) => current.includes(code)
      ? current.length === 1 ? current : current.filter((market) => market !== code)
      : [...current, code]);
  };

  const saveMarkets = async () => {
    setSaving(true);
    setMessage("");
    const { error } = await supabase.from("app_settings").update({
      discovery_markets: markets,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    setMessage(error ? error.message : `APAC markets saved: ${markets.join(", ")}.`);
    setSaving(false);
  };

  if (!authorized) return null;

  return (
    <div className={styles.root}>
      {open ? (
        <section className={styles.panel} aria-label="APAC discovery status">
          <header className={styles.header}>
            <div><p className={styles.eyebrow}>Source-first scanner</p><h2>Discovery health</h2></div>
            <button className={styles.close} onClick={() => setOpen(false)} aria-label="Close discovery health">×</button>
          </header>

          <div className={styles.sourceHealthGrid} aria-label="Source health summary">
            <div className={styles.metric}><strong>{healthyCount}</strong><span>healthy sources</span></div>
            <div className={styles.metric}><strong>{dueCount}</strong><span>due now</span></div>
            <div className={styles.metric}><strong>{failingCount}</strong><span>failing</span></div>
            <div className={styles.metric}><strong>{quarantineCount}</strong><span>quarantined</span></div>
          </div>

          <section className={styles.section}>
            <div className={styles.sectionHeading}><h3>APAC markets</h3><small>{markets.length} enabled</small></div>
            <div className={styles.marketToggleGrid}>
              {MARKETS.map((market) => {
                const active = markets.includes(market.code);
                return <button key={market.code} type="button" className={`${styles.marketButton} ${active ? styles.marketButtonActive : ""}`} aria-pressed={active} onClick={() => toggleMarket(market.code)}><strong>{market.code}</strong><span>{market.label}</span></button>;
              })}
            </div>
            <div className={styles.actions}><button className={styles.button} type="button" onClick={saveMarkets} disabled={saving}>{saving ? "Saving..." : "Save markets"}</button></div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}><h3>Latest crawl</h3><small>{latestRun ? formatDate(latestRun.started_at, true) : "No run"}</small></div>
            {latestRun ? <div className={styles.runSummary}>
              <div><strong>{latestRun.status}</strong><span>run status</span></div>
              <div><strong>{latestRun.sources_succeeded}/{latestRun.sources_attempted}</strong><span>sources</span></div>
              <div><strong>{latestRun.verified_open}</strong><span>live postings</span></div>
              <div><strong>{latestRun.inserted}</strong><span>new matches</span></div>
              <div><strong>{latestRun.refreshed}</strong><span>refreshed</span></div>
              <div><strong>{latestRun.closed}</strong><span>closed</span></div>
            </div> : <p className={styles.empty}>No source-first crawl has been recorded.</p>}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}><h3>Verified open</h3><small>{verifiedCount} trusted matches</small></div>
            <div className={styles.jobList}>
              {verifiedJobs.length ? verifiedJobs.map((job) => <article className={styles.job} key={job.id}>
                <div className={styles.jobTop}><div><strong>{job.position}</strong><span>{job.company} · {job.market_code || "APAC"}</span></div><span className={styles.verifiedBadge}>Verified open</span></div>
                <div className={styles.jobMeta}>
                  <div><span>Posted</span><strong>{formatDate(job.posted_at)}</strong></div>
                  <div><span>First seen</span><strong>{formatDate(job.first_seen_at, true)}</strong></div>
                  <div><span>Last verified</span><strong>{formatDate(job.last_verified_at, true)}</strong></div>
                  <div><span>Source</span><strong>{job.ats_platform || "Official employer"} · {job.source_trust || "trusted"}</strong></div>
                </div>
              </article>) : <p className={styles.empty}>No trusted verified-open matches are currently in the Discovered queue.</p>}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}><h3>Source health</h3><small>{sources.length} registered</small></div>
            <div className={styles.healthList}>
              {sources.map((source) => <div className={styles.healthRow} key={source.id}><div><strong>{source.display_name}</strong><small>{source.provider} · {source.adapter} · {source.market_codes.join(", ")}</small></div><span className={source.consecutive_failures ? styles.healthStatusFail : styles.healthStatus}>{source.consecutive_failures ? `${source.consecutive_failures} failures` : source.last_success_at ? "Healthy" : "Pending"}</span></div>)}
            </div>
          </section>

          <div className={styles.actions}><button className={styles.secondaryButton} type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button></div>
          {message ? <p className={styles.message} role="status">{message}</p> : null}
          <p className={styles.footerNote}>Public job ingestion runs from Supabase infrastructure. Search providers learn trusted source roots; only verified employer or approved board records enter this panel.</p>
        </section>
      ) : (
        <button className={styles.launcher} type="button" onClick={() => setOpen(true)} aria-label="Open discovery health"><span className={failingCount ? styles.launcherDotWarning : styles.launcherDot} />Discovery health · {healthyCount}/{sources.length}</button>
      )}
    </div>
  );
}
