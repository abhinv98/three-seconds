import Link from "next/link";
import { Icon } from "@/components/icon";
import { ReplayReel } from "@/components/landing/replay-reel";

// Verdict tabs stacked like the mood board's palette chips: a fill, a darker lip, each over the next.
const TABS = [
  {
    sign: "✕",
    word: "Fail",
    title: "Label held long enough",
    meta: "1.8s of 28.0s",
    className: "bg-[linear-gradient(#c62a43_55%,var(--fail-600)_95%)] text-[var(--paper-50)] shadow-[inset_0_-7px_0_#7d0c20,inset_0_2px_2px_rgb(255_255_255/0.22)]",
  },
  {
    sign: "◉",
    word: "Review",
    title: "Label language matches speech",
    meta: "en label · hi-Latn speech",
    className: "bg-[linear-gradient(#f6cb62_55%,var(--review-300)_95%)] text-[var(--ink-950)] shadow-[inset_0_-7px_0_#c48a14,inset_0_2px_2px_rgb(255_255_255/0.4)]",
  },
  {
    sign: "✓",
    word: "Pass",
    title: "Spoken disclosure",
    meta: "said at 00:21.0",
    className: "bg-[linear-gradient(#138b97_55%,var(--pass-600)_95%)] text-[var(--paper-50)] shadow-[inset_0_-7px_0_#04505a,inset_0_2px_2px_rgb(255_255_255/0.22)]",
  },
  {
    sign: "✓",
    word: "Pass",
    title: "Disclosure label on screen",
    meta: "from 00:00.4",
    className: "bg-[linear-gradient(#138b97_55%,var(--pass-600)_95%)] text-[var(--paper-50)] shadow-[inset_0_-7px_0_#04505a,inset_0_2px_2px_rgb(255_255_255/0.22)]",
  },
];

/** What the check finds: the measured sentence on a palette-card gradient, the verdicts as stacked tabs, the live replay. */
export function TheCall() {
  return (
    <section id="call" aria-labelledby="call-heading" className="scroll-mt-24 mx-auto max-w-[1200px] px-4 pt-16 pb-24 sm:px-6 sm:pt-20 sm:pb-32">
      <h2
        id="call-heading"
        className="max-w-[20ch] text-[clamp(2.4rem,5.4vw,4.25rem)] leading-[1] font-bold tracking-[-0.03em] text-balance"
      >
        Found at 00:03.0.
        <span className="block text-muted-foreground">The label had left at 00:02.2.</span>
      </h2>
      <div className="mt-14 grid items-start gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:gap-12">
        <div>
          <p className="font-mono text-[12px] leading-4 text-muted-foreground">The sample Reel · glow-serum-reel.mp4 · 00:28.0</p>
          <div className="mt-5 max-w-[520px]">
            <div className="relative z-10 rounded-[24px] bg-[linear-gradient(160deg,var(--pal-pomegranate)_0%,var(--pal-petal)_55%,var(--pal-flax)_100%)] p-6 pb-12 text-[var(--ink-950)] sm:p-8 sm:pb-14">
              <p className="font-mono text-[12px] leading-4 text-[var(--ink-950)]/70">Verdict</p>
              <p className="mt-3 text-[clamp(2.4rem,5.4vw,3.75rem)] leading-[0.95] font-extrabold tracking-[-0.025em] text-[var(--ink-950)]">
                Label held 1.8s.
              </p>
              <p className="mt-3 max-w-[34ch] text-[17px] leading-7 text-[var(--ink-950)]/80">
                It&apos;s gone before the brand appears at 00:03.0. The fix: keep it up while the brand is on screen.
              </p>
            </div>
            <ul className="relative -mt-6 flex flex-col" aria-label="Checks, worst first">
              {TABS.map((tab, i) => (
                <li
                  key={tab.title}
                  className={`relative flex items-center gap-4 rounded-[18px] px-5 pb-6 ${tab.className} ${i > 0 ? "-mt-3 pt-4" : "pt-10"}`}
                  style={{ zIndex: 9 - i }}
                >
                  <span className="w-20 shrink-0 text-[13px] font-extrabold tracking-[0.08em] uppercase">
                    {tab.sign} {tab.word}
                  </span>
                  <span className="min-w-0 flex-1 text-[16px] font-semibold">{tab.title}</span>
                  <span className="hidden font-mono text-[12px] opacity-80 sm:block">{tab.meta}</span>
                </li>
              ))}
            </ul>
          </div>
          <Link
            href="/report/sample"
            className="ts-body mt-8 inline-flex items-center gap-2 rounded-sm font-semibold text-foreground underline decoration-border decoration-2 underline-offset-[6px] transition-colors hover:decoration-brand"
          >
            Open the full sample report
            <Icon name="arrow-right" size={18} />
          </Link>
        </div>
        <ReplayReel />
      </div>
    </section>
  );
}
