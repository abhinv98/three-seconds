import { Closing } from "@/components/landing/closing";
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
import "./landing.css";

// Spring motion on this page after Daniel Holden's Spring-It-On (MIT); see lib/spring.ts.
export default function LandingPage() {
  return (
    <>
      <LandingRoot>
        <Intro />
        <LandingNav />
        <main id="main">
          <HeroRibbon />
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
