"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 899px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** True below 900px wide, where the landing page switches to its single-column layouts. False on the server. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
