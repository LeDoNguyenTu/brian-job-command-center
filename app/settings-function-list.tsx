"use client";

import { useEffect } from "react";

type PanelEntry = {
  panel: HTMLElement;
  button: HTMLButtonElement;
};

const textFrom = (root: Element, selector: string, fallback: string) =>
  root.querySelector(selector)?.textContent?.trim() || fallback;

export default function SettingsFunctionListEnhancer() {
  useEffect(() => {
    const cleanups = new Set<() => void>();

    const enhance = () => {
      const modal = document.querySelector<HTMLElement>(".security-modal");
      if (!modal || modal.dataset.settingsFunctionList === "ready") return;

      const panels = Array.from(modal.querySelectorAll<HTMLElement>(":scope > .security-panel"));
      if (!panels.length) return;

      modal.dataset.settingsFunctionList = "ready";
      const list = document.createElement("nav");
      list.className = "settings-function-list";
      list.setAttribute("aria-label", "Settings functions");

      const intro = document.createElement("div");
      intro.className = "settings-function-list-intro";
      intro.innerHTML = "<strong>Settings functions</strong><span>Choose a function to view or edit its detailed settings.</span>";
      list.appendChild(intro);

      const entries: PanelEntry[] = panels.map((panel, index) => {
        const title = textFrom(panel, ".security-heading h3", `Settings section ${index + 1}`);
        const category = textFrom(panel, ".security-heading p", "Settings");
        const status = panel.querySelector(".connection-status")?.textContent?.trim() || "Configure";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "settings-function-button";
        button.setAttribute("role", "tab");
        button.innerHTML = `<span>${category}</span><strong>${title}</strong><small>${status}</small>`;
        list.appendChild(button);
        return { panel, button };
      });

      let selectedIndex = 0;
      const selectPanel = (nextIndex: number) => {
        selectedIndex = Math.max(0, Math.min(entries.length - 1, nextIndex));
        entries.forEach(({ panel, button }, index) => {
          panel.hidden = index !== selectedIndex;
          button.classList.toggle("active", index === selectedIndex);
          button.setAttribute("aria-selected", index === selectedIndex ? "true" : "false");
          button.tabIndex = index === selectedIndex ? 0 : -1;
        });
      };

      entries.forEach(({ button }, index) => {
        const onClick = () => selectPanel(index);
        const onKeyDown = (event: KeyboardEvent) => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
          const next = event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : (index + delta + entries.length) % entries.length;
          selectPanel(next);
          entries[next]?.button.focus();
        };
        button.addEventListener("click", onClick);
        button.addEventListener("keydown", onKeyDown);
        cleanups.add(() => {
          button.removeEventListener("click", onClick);
          button.removeEventListener("keydown", onKeyDown);
        });
      });

      const account = modal.querySelector(".security-account");
      if (account) account.insertAdjacentElement("afterend", list);
      else modal.querySelector(".security-intro")?.insertAdjacentElement("afterend", list);
      selectPanel(0);

      cleanups.add(() => {
        list.remove();
        panels.forEach((panel) => { panel.hidden = false; });
        delete modal.dataset.settingsFunctionList;
      });
    };

    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    enhance();

    return () => {
      observer.disconnect();
      for (const cleanup of cleanups) cleanup();
      cleanups.clear();
    };
  }, []);

  return null;
}
