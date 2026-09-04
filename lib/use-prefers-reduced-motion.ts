"use client";

import { useCallback, useSyncExternalStore } from "react";

/*
  useSyncExternalStore rather than useState + useEffect: orbkit's lint bans
  setState inside an effect body (cascading renders), and a media query is
  exactly the external store this hook is designed for — it also gets the
  right value on the first client render instead of flashing "no preference".
*/
const QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const query = window.matchMedia(QUERY);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    // Server snapshot: assume motion is fine, matching the CSS default.
    () => false
  );
}
