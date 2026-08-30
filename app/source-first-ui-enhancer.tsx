"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

const MANUAL_SCAN_POLL_MS = 15_000;
const MANUAL_SCAN_MAX_POLLS = 480;
const MANUAL_SCAN_QUEUE_GRACE_POLLS = 5;
const MANUAL_SCAN_STARTED_KEY = "brian-manual-scan-started-at";
const MANUAL_SCAN_LAST_JOB_KEY = "brian-manual-scan-last-job-id";

export default function SourceFirstUiEnhancer() {
  useEffect(() => {
    let manualScanTimer = 0;
    let manualScanPolls = 0;
    let manualScanStartedAt = sessionStorage.getItem(MANUAL_SCAN_STARTED_KEY) ?? "";
    let manualScanLastJobId = sessionStorage.getItem(MANUAL_SCAN_LAST_JOB_KEY) ?? "";

    const update = () => {
      const scoutTitle = document.querySelector<HTMLElement>(".scout-card .scout-header p");
      if (scoutTitle && scoutTitle.textContent !== "Source-first Job Scanner") scoutTitle.textContent = "Source-first Job Scanner";

      const nextScan = document.querySelector<HTMLElement>(".scout-card .next-scan");
      const scannerStatus = "Supabase scanner · independent of ChatGPT";
      if (nextScan && nextScan.textContent !== scannerStatus) nextScan.textContent = scannerStatus;

      const feedDateLabel = Array.from(document.querySelectorAll<HTMLElement>(".feed-date-filter .filter-label"))
        .find((label) => label.textContent?.trim() === "Feed date");
      if (feedDateLabel) feedDateLabel.textContent = "Posted date";

      const allDates = document.querySelector<HTMLOptionElement>(".feed-date-filter select option[value='all']");
      if (allDates && allDates.textContent !== "All posted dates") allDates.textContent = "All posted dates";

      for (const heading of document.querySelectorAll<HTMLElement>(".feed-day-heading > span")) {
        if (heading.textContent?.trim() === "Date not recorded") heading.textContent = "Date unavailable";
      }
    };

    const scanStatusElement = () => document.querySelector<HTMLElement>(".discovery-message");
    const clearManualScanTimer = () => {
      if (manualScanTimer) window.clearTimeout(manualScanTimer);
      manualScanTimer = 0;
    };
    const stopManualScanMonitor = (clearSession = true) => {
      clearManualScanTimer();
      manualScanPolls = 0;
      manualScanStartedAt = "";
      manualScanLastJobId = "";
      if (clearSession) {
        sessionStorage.removeItem(MANUAL_SCAN_STARTED_KEY);
        sessionStorage.removeItem(MANUAL_SCAN_LAST_JOB_KEY);
      }
    };

    const pollManualScan = async () => {
      if (!manualScanStartedAt || manualScanPolls >= MANUAL_SCAN_MAX_POLLS) {
        stopManualScanMonitor();
        return;
      }
      manualScanPolls += 1;
      const now = new Date().toISOString();

      const [sourcesResult, jobsResult] = await Promise.all([
        supabase.from("discovery_sources")
          .select("id", { count: "exact", head: true })
          .eq("enabled", true)
          .lte("next_crawl_at", now),
        supabase.from("jobs")
          .select("id, created_at")
          .gte("created_at", manualScanStartedAt)
          .not("source_id", "is", null)
          .eq("pipeline", "Discovered")
          .eq("availability_status", "verified_open")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      const queuedSources = sourcesResult.count ?? 0;
      const preparing = queuedSources === 0 && manualScanPolls < MANUAL_SCAN_QUEUE_GRACE_POLLS;
      const status = scanStatusElement();
      if (status && !sourcesResult.error) {
        status.textContent = queuedSources > 0
          ? `Manual full-registry scan is running. ${queuedSources} enabled source${queuedSources === 1 ? " remains" : "s remain"} queued for safe crawling. New trusted matches will appear automatically.`
          : preparing
            ? "Preparing the manual full-registry scan and learning any new trusted source roots..."
            : "Manual full-registry scan completed. No additional trusted matches have appeared yet under the current filters.";
      }

      const newestJobId = jobsResult.data?.[0]?.id ? String(jobsResult.data[0].id) : "";
      if (newestJobId && newestJobId !== manualScanLastJobId) {
        manualScanLastJobId = newestJobId;
        sessionStorage.setItem(MANUAL_SCAN_LAST_JOB_KEY, newestJobId);
        clearManualScanTimer();
        window.location.reload();
        return;
      }
      if (!sourcesResult.error && queuedSources === 0 && !preparing) {
        stopManualScanMonitor();
        return;
      }

      manualScanTimer = window.setTimeout(() => void pollManualScan(), MANUAL_SCAN_POLL_MS);
    };

    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
      if (!button || button.textContent?.trim() !== "Fetch now") return;
      stopManualScanMonitor();
      manualScanStartedAt = new Date().toISOString();
      manualScanLastJobId = "";
      sessionStorage.setItem(MANUAL_SCAN_STARTED_KEY, manualScanStartedAt);
      sessionStorage.removeItem(MANUAL_SCAN_LAST_JOB_KEY);
      manualScanTimer = window.setTimeout(() => void pollManualScan(), 2_000);
    };

    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", onClick);
    update();
    if (manualScanStartedAt) manualScanTimer = window.setTimeout(() => void pollManualScan(), 2_000);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick);
      clearManualScanTimer();
    };
  }, []);

  return null;
}
