"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { Report } from "./report";

// Reports live in sessionStorage until there is a database: one tab, one session.
const key = (id: string) => `ts:report:${id}`;

export function saveReport(report: Report): boolean {
  try {
    sessionStorage.setItem(key(report.job_id), JSON.stringify(report));
    return true;
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** undefined while hydrating, null when this tab has no such report. */
export function useStoredReport(id: string): Report | null | undefined {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return sessionStorage.getItem(key(id));
      } catch {
        return null;
      }
    },
    () => undefined,
  );
  return useMemo(() => {
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as Report;
    } catch {
      return null;
    }
  }, [raw]);
}
