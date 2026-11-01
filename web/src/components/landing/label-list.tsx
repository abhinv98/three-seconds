"use client";

import { useId, useRef, useState } from "react";
import { ASCI_SOURCE_URL } from "@/lib/asci";

type Row = { label: string; lang?: string; meaning: string; verdict: "Counts" | "Review" };

// The 1.3a list as ASCI words it, the Hindi equivalents the checker matches (worker/pipeline/asci.py),
// the two platform tags, and disclosure-like words that are not on the list.
const TABS: { id: string; name: string; note: string; rows: Row[] }[] = [
  {
    id: "english",
    name: "In English",
    note: "ASCI 1.3a",
    rows: [
      { label: "Advertisement", meaning: "The full word", verdict: "Counts" },
      { label: "Ad", meaning: "Also as #ad", verdict: "Counts" },
      { label: "Sponsored", meaning: "Also as #sponsored", verdict: "Counts" },
      { label: "Collaboration", meaning: "The full word, not “Collab”", verdict: "Counts" },
      { label: "Partnership", meaning: "Also inside “Paid partnership with …”", verdict: "Counts" },
      { label: "Employee", meaning: "The creator works for the brand", verdict: "Counts" },
      { label: "Free gift", meaning: "The product was given, not bought", verdict: "Counts" },
      { label: "Affiliate", meaning: "The creator earns on each sale", verdict: "Counts" },
    ],
  },
  {
    id: "hindi",
    name: "In Hindi",
    note: "On a Hindi ad, 1.3b",
    rows: [
      { label: "विज्ञापन", lang: "hi", meaning: "Advertisement", verdict: "Counts" },
      { label: "प्रायोजित", lang: "hi", meaning: "Sponsored", verdict: "Counts" },
      { label: "सहयोग", lang: "hi", meaning: "Collaboration", verdict: "Counts" },
      { label: "साझेदारी", lang: "hi", meaning: "Partnership, also भागीदारी", verdict: "Counts" },
      { label: "कर्मचारी", lang: "hi", meaning: "Employee", verdict: "Counts" },
      { label: "मुफ़्त उपहार", lang: "hi", meaning: "Free gift", verdict: "Counts" },
      { label: "सशुल्क प्रचार", lang: "hi", meaning: "Paid promotion", verdict: "Counts" },
    ],
  },
  {
    id: "platform",
    name: "Platform tags",
    note: "Instagram, YouTube",
    rows: [
      { label: "Paid partnership", meaning: "Instagram’s tag under the creator’s name", verdict: "Counts" },
      { label: "Includes paid promotion", meaning: "YouTube’s tag on the video", verdict: "Counts" },
    ],
  },
  {
    id: "not-listed",
    name: "Not on the list",
    note: "Goes to review",
    rows: [
      { label: "Collab", meaning: "Short for collaboration, but not ASCI’s word", verdict: "Review" },
      { label: "#spon", meaning: "Too short to be “Sponsored”", verdict: "Review" },
      { label: "#partner", meaning: "Not “Partnership”", verdict: "Review" },
    ],
  },
];

export function LabelList() {
  const base = useId();
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tab = TABS[active];

  const move = (to: number) => {
    const next = (to + TABS.length) % TABS.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section id="labels" className="lp-labels" aria-labelledby="labels-title">
      <div className="lp-labels__head">
        <h2 id="labels-title" className="lp-h-l">
          <span className="lp-soft">#ad counts.</span>
          <br />
          Collab doesn’t.
        </h2>
        <a href={ASCI_SOURCE_URL} target="_blank" rel="noreferrer" className="lp-link lp-link--underline" data-rv="1">
          Read ASCI’s list (PDF)
        </a>
      </div>

      <div className="lp-labels__body" data-rv="1">
        <div role="tablist" aria-label="Kinds of label" aria-orientation="vertical" className="lp-tabs">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={i === active}
              aria-controls={`${base}-panel`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                  e.preventDefault();
                  move(i + 1);
                } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  move(i - 1);
                } else if (e.key === "Home") {
                  e.preventDefault();
                  move(0);
                } else if (e.key === "End") {
                  e.preventDefault();
                  move(TABS.length - 1);
                }
              }}
              className="lp-tab"
            >
              <span className="lp-tab__name">{t.name}</span>
              <span className="lp-tab__note">{t.note}</span>
            </button>
          ))}
        </div>

        <ul
          key={tab.id}
          role="tabpanel"
          id={`${base}-panel`}
          aria-labelledby={`${base}-tab-${tab.id}`}
          className="lp-bands"
        >
          {tab.rows.map((row, i) => (
            <li key={row.label} className="lp-band" style={{ "--i": i } as React.CSSProperties}>
              <span className="lp-band__label" lang={row.lang}>
                {row.label}
              </span>
              <span className="lp-band__meaning">{row.meaning}</span>
              <span className="lp-band__verdict" data-verdict={row.verdict}>
                {row.verdict}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
