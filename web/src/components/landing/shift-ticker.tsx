"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCountdown, shiftRemaining, untilNextShift, untilSix, whereIsTickle } from "@/lib/ist";

/**
 * A small clock in the corner: how long Tickle has left on shift, or, after six, that he has gone home and when he is
 * back. At the change of shift it flips html[data-tickle], which takes him off the page (or puts him back).
 */
export function ShiftTicker() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  const where = now === null ? null : whereIsTickle(now, location.search);
  useEffect(() => {
    if (where) document.documentElement.dataset.tickle = where;
  }, [where]);

  if (now === null || where === null) return null;
  if (where === "work")
    return (
      <p className="lp-ticker">
        <span className="lp-ticker__dot" aria-hidden="true" />
        Tickle is on shift · off in <span className="lp-ticker__time">{formatCountdown(shiftRemaining(now) ?? untilSix(now))}</span>
      </p>
    );
  return (
    <p className="lp-ticker" data-home="">
      Tickle has gone home · back in <span className="lp-ticker__time">{formatCountdown(untilNextShift(now))}</span> ·{" "}
      <Link href="/cave" className="lp-ticker__link">
        Follow him
      </Link>
    </p>
  );
}
