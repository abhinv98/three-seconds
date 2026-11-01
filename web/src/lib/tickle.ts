"use client";

import { useSyncExternalStore } from "react";

// The landing page's character and the name the visitor chose for him. His six titles spell T.I.C.K.L.E.; he would
// rather be called by all of them, and sulks for the rest of the visit if the visitor picks the acronym.

export const TICKLE_TITLES: { initial: string; rest: string }[] = [
  { initial: "T", rest: "imekeeper of Reels and Shorts" },
  { initial: "I", rest: "nspector of Paid Partnerships" },
  { initial: "C", rest: "ounter of Every Tenth of a Second" },
  { initial: "K", rest: "eeper of the Three-Second Rule" },
  { initial: "L", rest: "ord of the Unbroken Hold" },
  { initial: "E", rest: "ternal Enemy of “Collab”" },
];

const titles = TICKLE_TITLES.map((t) => t.initial + t.rest);
export const TICKLE_FULL = `${titles.slice(0, -1).join(", ")} and ${titles.at(-1)}`;
export const TICKLE_WORDS = TICKLE_FULL.split(/\s+/).length;
export const TICKLE_SHORT = "Tickle";

export type TickleChoice = "full" | "short" | "skip";

// The theme boot script (components/theme-menu.tsx) reads the same key before first paint to decide on the intro.
export const TICKLE_KEY = "lp-tickle";
const CHANGE_EVENT = "lp-tickle-change";
let memory: TickleChoice | null = null; // when storage is blocked, the choice lasts for this page view

function readChoice(): TickleChoice | null {
  try {
    const value = localStorage.getItem(TICKLE_KEY);
    if (value === "full" || value === "short" || value === "skip") return value;
  } catch {
    // fall through to the in-memory choice
  }
  return memory;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function chooseName(choice: TickleChoice) {
  memory = choice;
  try {
    localStorage.setItem(TICKLE_KEY, choice);
  } catch {
    // private mode: memory holds it
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The visitor's choice, or null before they made one (and during server render). */
export function useTickleChoice(): TickleChoice | null {
  return useSyncExternalStore(subscribe, readChoice, () => null);
}

/** He sulks for the whole visit once called by his acronym. */
export function useSulking(): boolean {
  return useTickleChoice() === "short";
}
