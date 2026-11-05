import { headers } from "next/headers";
import { Closing } from "@/components/landing/closing";
import { DaypartGreeting } from "@/components/landing/daypart-greeting";
import { Faq } from "@/components/landing/faq";
import { HeroRibbon } from "@/components/landing/hero-ribbon";
import { HoldRule } from "@/components/landing/hold-rule";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Intro } from "@/components/landing/intro";
import { LabelList } from "@/components/landing/label-list";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingRoot } from "@/components/landing/landing-root";
import { RuleStatement } from "@/components/landing/rule-statement";
import { ShiftTicker } from "@/components/landing/shift-ticker";
import { VerdictWall } from "@/components/landing/verdict-wall";
import { Zipper } from "@/components/landing/zipper";
import { clockFallbackScript, readClock } from "@/lib/daypart";
import "./landing.css";

// Spring motion on this page after Daniel Holden's Spring-It-On (MIT); see lib/spring.ts.
export default async function LandingPage({ searchParams }: PageProps<"/">) {
  const [request, query] = await Promise.all([headers(), searchParams]);
  const clock = readClock({ tz: request.get("x-vercel-ip-timezone"), country: request.get("x-vercel-ip-country") }, query);
  return (
    <>
      <LandingRoot daypart={clock.part}>
        {!clock.zone && !clock.forced && <script dangerouslySetInnerHTML={{ __html: clockFallbackScript() }} />}
        <Intro />
        <LandingNav />
        <main id="main">
          <HeroRibbon greeting={<DaypartGreeting clock={clock} />} />
          <RuleStatement />
          <HowItWorks />
          <HoldRule />
          <LabelList />
          <VerdictWall />
          <Faq />
          <Closing />
        </main>
        <ShiftTicker />
      </LandingRoot>
      {/* Outside the page's root on purpose: the page is what unzips, and the cave sits behind it. */}
      <Zipper />
    </>
  );
}
