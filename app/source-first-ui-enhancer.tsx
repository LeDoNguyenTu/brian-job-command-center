"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

const MANUAL_SCAN_POLL_MS = 15_000;
const MANUAL_SCAN_MAX_POLLS = 120;

export default function SourceFirstUiEnhancer() {
  useEffect(() => {
    let manualScanTimer = 0;
    let manualScanPolls = 0;
    let manualScanStartedAt = "";

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

    const stopManualScanMonitor = () => {
      if (manualScanTimer) window.clearTimeout(manualScanTimer);
      manualScanTimer = 0;
      manualScanPolls = 0;
      manualScanStartedAt = "";
    };

    const pollManualScan = async () => {
      if (!manualScanStartedAt || manualScanPolls >= MANUAL_SCAN_MAX_POLLS) {
        stopManualScanMonitor();
        return;
      }
      manualScanPolls += 1;

      const [settingsResult, jobsResult] = await Promise.all([
        supabase.from("app_settings")
          .select("discovery_message")
          .eq("id", 1)
          .maybeSingle(),
        supabase.from("jobs")
          .select("id, created_at")
          .gte("created_at", manualScanStartedAt)
          .not("source_id", "is", null)
          .eq("pipeline", "Discovered")
          .eq("availability_status", "verified_open")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      const backendMessage = settingsResult.data?.discovery_message;
      if (typeof backendMessage === "string" && backendMessage.startsWith("Manual full-registry scan")) {
        const status = document.querySelector<HTMLElement>(".discovery-message");
        if (status) status.textContent = backendMessage;
      }

      if ((jobsResult.data?.length ?? 0) > 0) {
        stopManualScanMonitor();
        window.location.reload();
        return;
      }

      manualScanTimer = window.setTimeout(() => void pollManualScan(), MANUAL_SCAN_POLL_MS);
    };

    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
      if (!button || button.textContent?.trim() !== "Fetch now") return;
      stopManualScanMonitor();
      manualScanStartedAt = new Date().toISOString();
      manualScanTimer = window.setTimeout(() => void pollManualScan(), 2_000);
    };

    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", onClick);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick);
      stopManualScanMonitor();
    };
  }, []);

  return null;
}
