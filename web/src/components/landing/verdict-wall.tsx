"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Tick } from "./tick";

type Verdict = "pass" | "fail" | "review";

const QUIPS: Record<Verdict, string> = {
  pass: "That one’s fine. Post it.",
  fail: "That one needs fixing first.",
  review: "That one needs your eyes.",
};

// Sample verdicts in the words the checker uses (worker/pipeline/rules.py), each with its clause and, where there is
// something to do, the fix. They show the range of calls, not real customers.
const CARDS: {
  status: Verdict;
  check: string;
  detail: string;
  clause: string;
  fix?: string;
  style: Record<string, string>;
}[] = [
  {
    status: "fail",
    check: "Label held long enough",
    detail: "Label held 1.8s at most in one stretch; this 28.0s video needs 9.33s.",
    clause: "ASCI-IG 1.2e.II",
    fix: "Keep a permitted label on screen for at least 9.33s without a break.",
    style: { "--x": "3%", "--y": "6%", "--r": "-4deg", "--drift": "-6%", "--mx": "0%", "--my": "0px", "--mw": "86%" },
  },
  {
    status: "pass",
    check: "Label held long enough",
    detail: "Label held 4.5s in one stretch; this 12.0s video needs 3.0s.",
    clause: "ASCI-IG 1.2e.I",
    style: { "--x": "37%", "--y": "0%", "--r": "3deg", "--drift": "4%", "--mx": "10%", "--my": "210px", "--mw": "78%" },
  },
  {
    status: "review",
    check: "Disclosure label on screen",
    detail: "“Collab” is not one of the labels ASCI 1.3a permits, such as “Collaboration” or “Paid partnership”.",
    clause: "ASCI-IG 1.3a",
    fix: "Use a permitted label, for example “Collaboration”, “Paid partnership” or “Ad”.",
    style: { "--x": "68%", "--y": "9%", "--r": "-2deg", "--drift": "-3%", "--mx": "2%", "--my": "400px", "--mw": "92%" },
  },
  {
    status: "review",
    check: "Label held long enough",
    detail: "Within measurement margin. Label held about 5.3s and this 16.0s video needs 5.33s; 2 edge frames could not be read.",
    clause: "ASCI-IG 1.2e.II",
    fix: "Check where the label starts and ends by eye; a fraction of a second decides this check.",
    style: { "--x": "8%", "--y": "50%", "--r": "2deg", "--drift": "5%", "--mx": "12%", "--my": "640px", "--mw": "80%" },
  },
  {
    status: "fail",
    check: "Disclosure label on screen",
    detail: "No disclosure label on screen.",
    clause: "ASCI-IG 1.3a",
    fix: "Add a permitted label such as “Paid partnership” or “Ad”, on screen from the first second.",
    style: { "--x": "66%", "--y": "48%", "--r": "4deg", "--drift": "-5%", "--mx": "0%", "--my": "880px", "--mw": "88%" },
  },
];

export function VerdictWall() {
  // Tickle looks at the card under the pointer and holds up its verdict.
  const [focus, setFocus] = useState<{ status: Verdict; look: [number, number] } | null>(null);
  const aim = (e: React.PointerEvent<HTMLElement>) => {
    const status = e.currentTarget.dataset.status as Verdict;
    const me = e.currentTarget.parentElement?.querySelector(".lp-wall__tick canvas")?.getBoundingClientRect();
    const card = e.currentTarget.getBoundingClientRect();
    if (!me) return setFocus({ status, look: [0, -1] });
    const dx = card.left + card.width / 2 - (me.left + me.width / 2);
    const dy = card.top + card.height / 2 - (me.top + me.height / 2);
    setFocus({ status, look: [Math.abs(dx) > 80 ? Math.sign(dx) : 0, Math.abs(dy) > 80 ? Math.sign(dy) : 0] });
  };

  return (
    <section className="lp-sheet lp-wall" aria-labelledby="wall-title">
      <div className="lp-wall__head">
        <h2 id="wall-title" className="lp-h-l">
          Every call shows its working.
        </h2>
        <p>
          Sample verdicts, in the words the checker uses. Each one names what it measured, quotes the clause and, when
          something needs to change, says what.
        </p>
      </div>
      <div className="lp-wall__field">
        {CARDS.map((card) => (
          <article
            key={card.detail}
            className="lp-vcard"
            data-ui
            data-status={card.status}
            style={card.style as React.CSSProperties}
            onPointerEnter={aim}
            onPointerLeave={() => setFocus(null)}
          >
            <p className="lp-vcard__check">{card.check}</p>
            <p className="lp-vcard__detail">{card.detail}</p>
            <div className="lp-vcard__foot">
              <StatusBadge status={card.status} tone="solid" />
              <span className="lp-vcard__clause">{card.clause}</span>
            </div>
            {card.fix && <p className="lp-vcard__fix">{card.fix}</p>}
          </article>
        ))}
        <div className="lp-wall__tick" aria-hidden="true">
          <Tick
            size={152}
            mood={focus?.status ?? "point"}
            card={focus?.status ?? null}
            lcd={focus ? (focus.status === "pass" ? "3.0" : focus.status === "fail" ? "1.8" : "5.3") : "3.0"}
            look={focus?.look}
            say={focus ? QUIPS[focus.status] : undefined}
            outlined
            pokeable
          />
        </div>
      </div>
    </section>
  );
}
