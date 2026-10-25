"use client";

import { useSyncExternalStore } from "react";

// One switch pauses every looping animation on the page (WCAG 2.2.2), remembered per browser.
const STORAGE_KEY = "ts-motion";
const CHANGE_EVENT = "ts-motion-change";
let memory = false;

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "paused";
  } catch {
    return memory;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useMotionPaused(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

export function setMotionPaused(paused: boolean) {
  memory = paused;
  try {
    if (paused) localStorage.setItem(STORAGE_KEY, "paused");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode: the in-memory value carries the choice for this visit.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
