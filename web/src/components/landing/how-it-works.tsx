"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/status-badge";
import { Timeline } from "@/components/timeline";
import { asciClause } from "@/lib/asci";
import { useNarrow } from "@/lib/use-narrow";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";
import { Tick, type TickPose } from "./tick";

const HOLD = asciClause("ASCI-IG 1.2e.II");

const READINGS = [
  { src: "/landing/small-0000.jpg", time: "00:00.0", state: "No label", alt: "Frame at 00:00.0, no label" },
  { src: "/landing/small-0015.jpg", time: "00:00.5", state: "Paid partnership", alt: "Frame at 00:00.5 with “Paid partnership”" },
  { src: "/landing/small-0075.jpg", time: "00:02.5", state: "No label", alt: "Frame at 00:02.5, label gone" },
];

const LABEL_LANE = [
  { id: "label", name: "Label", description: "Paid partnership label", segments: [{ t_start: 0.4, t_end: 2.2 }] },
];

function Readings() {
  return (
    <div className="lp-readings">
      {READINGS.map((r) => (
        <figure key={r.time} className="lp-readings__item">
          <Image src={r.src} alt={r.alt} width={216} height={384} />
          <figcaption data-ui>
            <span className="lp-tc">{r.time}</span>
            <span data-found={r.state !== "No label" || undefined}>{r.state}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function Words() {
  return (
    <div className="lp-words" data-ui>
      <div className="lp-words__row">
        <span className="lp-words__text">“Paid partnership”</span>
        <span className="lp-words__where">label, top left · ASCI 1.3a</span>
        <StatusBadge status="pass" />
      </div>
      <div className="lp-words__row">
        <span className="lp-words__text">“#ad”</span>
        <span className="lp-words__where">caption · ASCI 1.3a</span>
        <StatusBadge status="pass" />
      </div>
      <div className="lp-words__row">
        <span className="lp-words__text">“Collab”</span>
        <span className="lp-words__where">label, top left · not on the list</span>
        <StatusBadge status="review" />
      </div>
    </div>
  );
}

/** The sample Reel playing with the real timeline under it; the playhead follows the video and seeks it. */
function Hold({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);

  // Plays only while its step is showing, never under reduced motion; the button pauses it for good (WCAG 2.2.2).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active && !reduced && !paused) video.play().catch(() => undefined);
    else video.pause();
  }, [active, reduced, paused]);

  return (
    <div className="lp-hold">
      <video
        ref={videoRef}
        className="lp-hold__video"
        src="/sample/glow-serum-reel.mp4"
        poster="/landing/frame-0012.jpg"
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="The sample Reel, 28 seconds, no sound"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <div className="lp-hold__side" data-ui>
        <Timeline
          duration={28}
          lanes={LABEL_LANE}
          playhead={0.4}
          videoRef={videoRef}
          onSeek={(t) => {
            if (videoRef.current) videoRef.current.currentTime = t;
          }}
          summary="Paid partnership label on screen from 00:00.4 to 00:02.2, 1.8 seconds in one stretch."
        />
        <p className="lp-hold__readout">
          <span>
            <strong>1.8s</strong> held
          </span>
          <span>
            <strong>9.33s</strong> needed
          </span>
        </p>
        <button
          type="button"
          className="lp-hold__toggle"
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            if (video.paused) {
              setPaused(false);
              video.play().catch(() => undefined);
            } else {
              setPaused(true);
              video.pause();
            }
          }}
        >
          <Icon name={playing ? "pause" : "play"} size={14} />
          {playing ? "Pause the Reel" : "Play the Reel"}
        </button>
      </div>
    </div>
  );
}

function Call() {
  return (
    <div className="lp-call" data-ui>
      <div className="lp-call__head">
        <StatusBadge status="fail" tone="solid" />
        <span className="lp-call__title">Label held long enough</span>
      </div>
      <p className="lp-call__detail">Label held 1.8s in one stretch; this 28.0s video needs 9.33s.</p>
      <figure className="lp-call__clause">
        <figcaption>{HOLD.code}</figcaption>
        <blockquote>{HOLD.text}</blockquote>
      </figure>
      <div className="lp-call__fix">
        <p className="lp-call__fix-title">Fix one thing before you post</p>
        <p>Keep the label on screen for at least 9.33s without a break.</p>
      </div>
    </div>
  );
}

const STEPS: { id: string; title: string; body: React.ReactNode; tick: TickPose; quip: string; at: number }[] = [
  {
    id: "read",
    title: "It reads the Reel twice a second.",
    body: "Each frame it samples is checked for a disclosure on screen: a tag, a sticker, or subtitles that say it.",
    tick: { mood: "read", lcd: "0.5" },
    quip: "Frame by frame. I barely blink.",
    at: 0.04,
  },
  {
    id: "words",
    title: "It checks the words against ASCI’s list.",
    body: (
      <>
        “Paid partnership”, “#ad” and “<span lang="hi">विज्ञापन</span>” count. “Collab” isn’t on the list, so it goes
        to review.
      </>
    ),
    tick: { mood: "review", lcd: "1.3", card: "review" },
    quip: "“Collab” again. My nemesis.",
    at: 0.92,
  },
  {
    id: "hold",
    title: "It times the longest unbroken hold.",
    body: "When the hold lands within half a second of the limit, it reads the edges again, ten times a second.",
    tick: { mood: "count", lcd: "1.8" },
    quip: "1.8 seconds. Not nearly enough.",
    at: 0.55,
  },
  {
    id: "call",
    title: "It makes the call, with the clause and the fix.",
    body: "The clause is quoted word for word. The fix is one line the creator can act on.",
    tick: { mood: "fail", lcd: "1.8", card: "fail" },
    quip: "Fail. Clause quoted, fix attached.",
    at: 0.1,
  },
];

export function HowItWorks() {
  const narrow = useNarrow();
  const reduced = useReducedMotion();
  // Desktop pins the section and walks the steps with the scroll; phones and reduced motion get them stacked.
  const pinned = !narrow && !reduced;
  const [active, setActive] = useState(0);
  const [walking, setWalking] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (!pinned) {
      const items = [...(listRef.current?.children ?? [])];
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) if (entry.isIntersecting) setActive(items.indexOf(entry.target));
        },
        { rootMargin: "-45% 0px -45% 0px" },
      );
      items.forEach((el) => io.observe(el));
      return () => io.disconnect();
    }
    let frame = 0;
    let current = -1;
    let walkTimer = 0;
    const update = () => {
      frame = 0;
      const pin = pinRef.current;
      if (!pin) return;
      const run = section.offsetHeight - pin.offsetHeight;
      const top = parseFloat(getComputedStyle(pin).top) || 0;
      const p = Math.min(1, Math.max(0, (top - section.getBoundingClientRect().top) / Math.max(run, 1)));
      section.style.setProperty("--p", p.toFixed(4));
      const next = Math.min(STEPS.length - 1, Math.floor(p * STEPS.length));
      if (next !== current) {
        // He walks over to the part of the panel the new step is about.
        if (current !== -1) {
          setWalking(true);
          window.clearTimeout(walkTimer);
          walkTimer = window.setTimeout(() => setWalking(false), 720);
        }
        current = next;
        setActive(next);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(walkTimer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pinned]);

  /** Steps are buttons: on desktop they scroll the runway to that step; stacked, they bring it into view. */
  const goTo = (i: number) => {
    const section = sectionRef.current;
    const pin = pinRef.current;
    if (!section || !pin) return;
    if (!pinned) {
      listRef.current?.children[i]?.scrollIntoView({ block: "center" });
      return;
    }
    const run = section.offsetHeight - pin.offsetHeight;
    const top = parseFloat(getComputedStyle(pin).top) || 0;
    const start = window.scrollY + section.getBoundingClientRect().top - top;
    window.scrollTo({ top: start + (run * (i + 0.5)) / STEPS.length });
  };

  const panels = [<Readings key="r" />, <Words key="w" />, <Hold key="h" active={active === 2} />, <Call key="c" />];
  const step = STEPS[active];

  return (
    <section
      ref={sectionRef}
      id="how"
      className="lp-sheet lp-story"
      data-pinned={pinned ? "" : undefined}
      aria-labelledby="how-title"
    >
      <div ref={pinRef} className="lp-story__pin">
        <div className="lp-story__rail">
          <h2 id="how-title" className="lp-h-l">
            What a check does
          </h2>
          <ol ref={listRef} className="lp-story__steps">
            {STEPS.map((item, i) => (
              <li key={item.id} className={cn("lp-story__step", i === active && "is-active")} style={{ "--i": i } as CSSProperties}>
                <h3 className="lp-story__title">
                  <button type="button" onClick={() => goTo(i)} aria-current={i === active ? "step" : undefined}>
                    {item.title}
                  </button>
                </h3>
                <div className="lp-story__more">
                  <div>
                    <p>{item.body}</p>
                  </div>
                </div>
                {pinned ? (
                  <span className="lp-story__bar" aria-hidden="true" />
                ) : (
                  <div className="lp-story__inline">
                    {panels[i]}
                    <div className="lp-story__inline-tick">
                      <Tick size={88} outlined pokeable {...item.tick} />
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <p className="lp-story__next">
            <strong>Coming next:</strong> it listens too. A disclosure said out loud in Hindi, Hinglish or English, with
            the time it was said.
          </p>
        </div>
        {pinned && (
          <div className="lp-story__stage">
            <div key={active} className="lp-story__panel">
              {panels[active]}
            </div>
            <div className="lp-story__floor">
              <div className="lp-story__walker" style={{ "--at": step.at } as CSSProperties}>
                <Tick size={150} outlined pokeable walking={walking} say={walking ? undefined : step.quip} {...step.tick} />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
