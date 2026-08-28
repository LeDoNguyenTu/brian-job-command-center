"use client";

import { useEffect } from "react";

export default function SourceFirstUiEnhancer() {
  useEffect(() => {
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

    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    update();
    return () => observer.disconnect();
  }, []);

  return null;
}
