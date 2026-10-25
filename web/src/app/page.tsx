import Link from "next/link";
import { AsciiField } from "@/components/landing/ascii-field";
import { CheckPosters } from "@/components/landing/check-posters";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { HeroDropBar } from "@/components/landing/hero-drop-bar";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNav } from "@/components/landing/landing-nav";
import { Languages } from "@/components/landing/languages";
import { ReplayReel } from "@/components/landing/replay-reel";
import { WhatsAppPreview } from "@/components/landing/whatsapp-preview";
import { Icon } from "@/components/icon";

const PIPELINE = [
  { model: "SAM 3.1", does: "tracks the label and the brand, frame by frame" },
  { model: "Muse Voice Transcribe", does: "hears Hindi, Hinglish and English" },
  { model: "Muse Spark", does: "checks the rule and writes the fix" },
];

export default function LandingPage() {
  return (
    <>
      <LandingNav />
      <main id="main">
        {/* Hero */}
        <section aria-labelledby="hero-heading" className="relative isolate overflow-hidden">
          <AsciiField className="absolute inset-0 -z-10" />
          <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:gap-10 lg:pt-20 lg:pb-24">
            <div className="hero-rise">
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[12px] leading-4 text-muted-foreground">
                <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
                Beta · checks ASCI influencer guidelines
              </p>
              <h1
                id="hero-heading"
                className="mt-6 text-[clamp(3.25rem,8.2vw,5.75rem)] leading-[0.94] font-extrabold tracking-[-0.03em] text-balance"
              >
                VAR for creator ads.
              </h1>
              <p className="ts-body mt-6 max-w-[48ch] text-pretty text-muted-foreground sm:text-[18px] sm:leading-[28px]">
                Upload a Reel or Short. Three Seconds measures the disclosure label to a tenth of a second, hears what&apos;s
                said in Hindi, Hinglish or English, and calls it against the ASCI guidelines before you post.
              </p>
              <div className="mt-9 max-w-[620px]">
                <HeroDropBar />
              </div>
              <ul className="mt-5 flex flex-wrap gap-2" aria-label="Shortcuts">
                <li>
                  <Link
                    href="/report/sample"
                    className="ts-body-sm inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 transition-colors duration-[120ms] hover:border-input"
                  >
                    <Icon name="play" size={14} />
                    Watch the sample report
                  </Link>
                </li>
                <li>
                  <a
                    href="#checks"
                    className="ts-body-sm inline-flex h-9 items-center rounded-[10px] border border-border bg-card px-3 transition-colors duration-[120ms] hover:border-input"
                  >
                    How the hold is measured
                  </a>
                </li>
                <li>
                  <a
                    href="#whatsapp"
                    className="ts-body-sm inline-flex h-9 items-center rounded-[10px] border border-border bg-card px-3 transition-colors duration-[120ms] hover:border-input"
                  >
                    WhatsApp verdicts, soon
                  </a>
                </li>
              </ul>
            </div>
            <ReplayReel />
          </div>
        </section>

        {/* Pipeline */}
        <section aria-label="Model pipeline" className="border-y border-border bg-card">
          <ol className="mx-auto grid max-w-[1200px] gap-x-8 gap-y-4 px-4 py-6 sm:px-6 md:grid-cols-3">
            {PIPELINE.map((step, i) => (
              <li key={step.model} className="flex items-center gap-3">
                <p className="ts-body-sm min-w-0 flex-1">
                  <span className="font-mono text-[13px] font-medium text-foreground">{step.model}</span>{" "}
                  <span className="text-muted-foreground">{step.does}</span>
                </p>
                {i < PIPELINE.length - 1 && (
                  <Icon name="arrow-right" size={16} className="hidden text-muted-foreground md:block" />
                )}
              </li>
            ))}
          </ol>
        </section>

        <HowItWorks />

        {/* Checks */}
        <section id="checks" aria-labelledby="checks-heading" className="scroll-mt-16 mx-auto max-w-[1200px] px-4 py-20 sm:px-6 sm:py-28">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
            <h2 id="checks-heading" className="text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.02] font-extrabold tracking-[-0.02em] text-balance">
              Four checks. Every one measured.
            </h2>
            <p className="ts-body max-w-[50ch] text-pretty text-muted-foreground lg:justify-self-end lg:text-[17px] lg:leading-7">
              Each check reports what it saw, when it saw it, and the clause it checked against. The sample verdicts
              below come from the same 28-second Reel.
            </p>
          </div>
          <div className="mt-12">
            <CheckPosters />
          </div>
        </section>

        <Languages />
        <WhatsAppPreview />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </>
  );
}
