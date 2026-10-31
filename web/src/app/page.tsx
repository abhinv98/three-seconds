import { CheckPosters } from "@/components/landing/check-posters";
import { Faq } from "@/components/landing/faq";
import { Hero } from "@/components/landing/hero";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNav } from "@/components/landing/landing-nav";
import { Languages } from "@/components/landing/languages";
import { PageField } from "@/components/landing/page-field";
import { TheCall } from "@/components/landing/the-call";

export default function LandingPage() {
  return (
    <>
      <LandingNav />
      <PageField>
        <main id="main">
          <Hero />
          <TheCall />

          <section id="checks" aria-labelledby="checks-heading" className="field-zone field-checks scroll-mt-16">
            <div className="section-y mx-auto max-w-[1200px] px-4 sm:px-6">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-end">
                <h2 id="checks-heading" data-rv="0" className="h-section">
                  Four checks.
                  <span className="block text-muted-foreground">Every one measured.</span>
                </h2>
                <p data-rv="1" className="ts-body max-w-[50ch] text-pretty text-foreground/80 lg:justify-self-end lg:text-[17px] lg:leading-7">
                  Each check reports what it saw, when it saw it, and the clause it checked against. The sample verdicts
                  come from the same 28-second Reel.
                </p>
              </div>
              <div data-rv="2" className="mt-12 sm:mt-16">
                <CheckPosters />
              </div>
            </div>
          </section>

          <Languages />
          <Faq />
        </main>
        <LandingFooter />
      </PageField>
    </>
  );
}
