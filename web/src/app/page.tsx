import { CheckPosters } from "@/components/landing/check-posters";
import { Faq } from "@/components/landing/faq";
import { Hero } from "@/components/landing/hero";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNav } from "@/components/landing/landing-nav";
import { Languages } from "@/components/landing/languages";
import { TheCall } from "@/components/landing/the-call";

export default function LandingPage() {
  return (
    <>
      <LandingNav />
      <main id="main">
        <Hero />
        <TheCall />

        <section id="checks" aria-labelledby="checks-heading" className="mesh-checks relative scroll-mt-16">
          <div className="relative mx-auto max-w-[1200px] px-4 py-24 sm:px-6 sm:py-32">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
              <h2 id="checks-heading" className="text-[clamp(2.4rem,5.4vw,4rem)] leading-[1] font-extrabold tracking-[-0.025em] text-balance">
                Four checks. Every one measured.
              </h2>
              <p className="ts-body max-w-[50ch] text-pretty text-muted-foreground lg:justify-self-end lg:text-[17px] lg:leading-7">
                Each check reports what it saw, when it saw it, and the clause it checked against. The sample verdicts
                come from the same 28-second Reel.
              </p>
            </div>
            <div className="mt-12">
              <CheckPosters />
            </div>
          </div>
        </section>

        <Languages />
        <Faq />
      </main>
      <LandingFooter />
    </>
  );
}
