"use client";

import { useSyncExternalStore } from "react";

// The page's resolved background colour, so canvas art can fade into it in either theme.
const FALLBACK = "rgb(243, 241, 234)"; // paper-100

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  window.addEventListener("ts-theme-change", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("ts-theme-change", onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read() {
  return getComputedStyle(document.body).backgroundColor || FALLBACK;
}

export function usePageBackground(): string {
  return useSyncExternalStore(subscribe, read, () => FALLBACK);
}
