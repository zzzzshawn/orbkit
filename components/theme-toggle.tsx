"use client";

import { useCallback } from "react";

import { ThemeMatrixIcon } from "@/components/matrix-icons";
import {
  applyTheme,
  useDocumentTheme,
  THEME_STORAGE_KEY,
  type ThemeMode
} from "@/lib/use-document-theme";

const THEME_TRANSITION_STYLE_ID = "orbkit-theme-transition-styles";

function updateTransitionStyles(css: string) {
  const existing = document.getElementById(THEME_TRANSITION_STYLE_ID);
  const styleElement =
    existing instanceof HTMLStyleElement ? existing : document.createElement("style");

  styleElement.id = THEME_TRANSITION_STYLE_ID;
  styleElement.textContent = css;

  if (!existing) {
    document.head.appendChild(styleElement);
  }
}

/** Wipe the new theme up over the old one instead of cross-fading. */
function createThemeTransitionCss() {
  return `
    ::view-transition-group(root) {
      animation-duration: 700ms;
      animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
    }

    ::view-transition-old(root) {
      animation: none;
      z-index: -1;
    }

    ::view-transition-new(root) {
      animation-name: orbkit-theme-reveal;
    }

    @keyframes orbkit-theme-reveal {
      from {
        clip-path: polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%);
      }
      to {
        clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      ::view-transition-group(root),
      ::view-transition-new(root),
      ::view-transition-old(root) {
        animation-duration: 0ms !important;
      }
    }
  `;
}

export function ThemeToggle() {
  const theme = useDocumentTheme();

  const toggleTheme = useCallback(() => {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    const switchTheme = () => {
      applyTheme(next);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Storage is unavailable in restricted contexts; the theme still applies.
      }
    };

    if (typeof document.startViewTransition !== "function") {
      switchTheme();
      return;
    }

    updateTransitionStyles(createThemeTransitionCss());
    const transition = document.startViewTransition(switchTheme);
    // A hidden tab skips the transition and rejects these; the theme still applies.
    transition.ready.catch(() => {});
    transition.finished.catch(() => {});
  }, [theme]);

  return (
    <button
      type="button"
      data-cue="toggle"
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggleTheme}
      className="inline-flex h-8 w-8 min-w-0 items-center justify-center rounded-xl bg-preset p-2 text-fg-dim sm:h-9 sm:w-9 transition-colors duration-150 ease-out hover:text-link-hover focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
    >
      <ThemeMatrixIcon className="size-4 sm:size-5" />
    </button>
  );
}
