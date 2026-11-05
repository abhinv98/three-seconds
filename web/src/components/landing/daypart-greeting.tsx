"use client";

import { useEffect, useRef, useState } from "react";
import { clockAt, paintDaypart, type LocalClock } from "@/lib/daypart";

/**
 * "Good evening from India, 19:42". Once a minute, on the minute, it rewrites the line and, when the visitor's clock
 * crosses into another daypart, repaints the page. With no zone from the server it reads the browser's.
 */
export function DaypartGreeting({ clock }: { clock: LocalClock }) {
  const { zone, country, forced } = clock;
  const ref = useRef<HTMLParagraphElement>(null);
  const [line, setLine] = useState(clock.line);

  useEffect(() => {
    const local = zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    let timer = 0;
    const tick = () => {
      const now = clockAt(Date.now(), local, country, forced);
      setLine(now.line);
      const root = ref.current?.closest<HTMLElement>(".lp");
      if (root) paintDaypart(root, now.part);
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    timer = window.setTimeout(tick, 0);
    return () => window.clearTimeout(timer);
  }, [zone, country, forced]);

  return (
    <p ref={ref} className="lp-greeting">
      {line}
    </p>
  );
}
