"use client";

import { useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "orbkit-theme";

/**
 * `data-theme` on <html> is the single source of truth — the inline script in
 * the layout stamps it before first paint, and the toggle writes to it. Reading
 * it through useSyncExternalStore keeps components in sync without a
 * mount-effect setState (which would cascade a second render).
 */
function subscribe(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"]
  });
  return () => observer.disconnect();
}

function getSnapshot(): ThemeMode {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** The layout renders with `data-theme="dark"`, so SSR must agree. */
function getServerSnapshot(): ThemeMode {
  return "dark";
}

export function useDocumentTheme(): ThemeMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}
