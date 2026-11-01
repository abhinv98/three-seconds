"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { chooseName, TICKLE_SHORT, TICKLE_TITLES, TICKLE_WORDS, useTickleChoice, type TickleChoice } from "@/lib/tickle";
import { useNarrow } from "@/lib/use-narrow";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { Tick, type TickMood } from "./tick";

// The page opens on a film leader counting down while the hero loads. Then Tickle drops in, reads out his six
// titles, watches their initials spell T.I.C.K.L.E. and asks what to call him. Returning visitors get the countdown
// and a one-line welcome (a sulk, if they called him Tickle).

type Mode = "first" | "back";
type Phase = "leader" | "hello" | "titles" | "acronym" | "ask" | "react" | "leaving" | "done";

// <html data-intro="first|back"> is set before first paint by the boot script in components/theme-menu.tsx: "first"
// until the visitor has named him, "back" afterwards, and nothing for a returning visitor who prefers reduced motion.
let bootMode: Mode | null | undefined;
function readMode(): Mode | null {
  if (bootMode === undefined) {
    const value = document.documentElement.dataset.intro;
    bootMode = value === "first" || value === "back" ? value : null;
  }
  return bootMode;
}
const noSubscribe = () => () => {};

function greeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning!";
  if (hour >= 12 && hour < 17) return "Good afternoon!";
  if (hour >= 17 && hour < 22) return "Good evening!";
  return "Up late? Me too.";
}

function preload(src: string) {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

// Pixel confetti for being called by his full title: fixed throws, so every visit gets the same burst.
const CONFETTI: [number, number, string][] = [
  [-150, -170, "--signal-500"],
  [-96, -220, "--pass-400"],
  [-40, -250, "--review-300"],
  [30, -240, "--signal-500"],
  [92, -210, "--fail-400"],
  [150, -160, "--pass-400"],
  [-186, -90, "--review-300"],
  [184, -96, "--signal-300"],
  [-120, -120, "--fail-400"],
  [120, -130, "--review-300"],
  [-60, -170, "--signal-300"],
  [64, -176, "--pass-600"],
];

const SKIPPABLE: Phase[] = ["leader", "hello", "titles", "acronym"];

export function Intro() {
  const mode = useSyncExternalStore(noSubscribe, readMode, () => null);
  const reduced = useReducedMotion();
  const narrow = useNarrow();
  const choice = useTickleChoice();
  const [phase, setPhase] = useState<Phase>("leader");
  const [hello, setHello] = useState("Hello!");
  const [counted, setCounted] = useState(0);
  const [picked, setPicked] = useState<TickleChoice | null>(null);
  const [hover, setHover] = useState<{ on: "full" | "short"; look: [number, number] } | null>(null);
  const [flight, setFlight] = useState<{ from: DOMRect; to: DOMRect } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const leaderRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<HTMLDivElement>(null);
  const flierRef = useRef<HTMLDivElement>(null);
  const titlesRef = useRef<HTMLParagraphElement>(null);
  const acroRef = useRef<HTMLParagraphElement>(null);
  const fullRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);
  const reducedRef = useRef(reduced);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  const finish = () => {
    delete document.documentElement.dataset.intro;
    bootMode = null;
    setPhase("done");
  };
  const leave = () => {
    clearTimers();
    const html = document.documentElement;
    html.classList.add("lp-met");
    html.dataset.intro = "leaving";
    (document.activeElement as HTMLElement | null)?.blur?.();
    // He flies to his place on the ribbon when it is on screen; otherwise he leaves with the frame.
    const from = meRef.current?.querySelector("canvas")?.getBoundingClientRect();
    const to = document.querySelector(".lp-ribbon__tick canvas")?.getBoundingClientRect();
    const seen = to && to.width > 0 && to.bottom > 0 && to.top < window.innerHeight;
    if (!reducedRef.current && from && to && seen) setFlight({ from, to });
    setPhase("leaving");
    if (!reducedRef.current)
      panelRef.current?.animate([{ transform: "none" }, { transform: "translateY(-100%)" }], {
        duration: 760,
        easing: "cubic-bezier(0.76, 0, 0.24, 1)",
        fill: "forwards",
      });
    later(reducedRef.current ? 0 : 820, finish);
  };
  const forward = () => {
    clearTimers();
    setCounted(TICKLE_TITLES.length);
    setPhase("ask");
  };
  const skip = () => {
    if (mode === "first" && !choice) chooseName("skip");
    leave();
  };
  const choose = (name: "full" | "short") => {
    setPicked(name);
    setHover(null);
    chooseName(name);
    setPhase("react");
    later(name === "full" ? 1700 : 2300, () => act.current.leave());
  };
  // Timers and listeners call the latest version of these.
  const act = useRef({ leave, forward, skip });
  useEffect(() => {
    act.current = { leave, forward, skip };
    reducedRef.current = reduced;
  });

  // The sequence. The countdown is CSS and runs from first paint; this waits for it, the fonts and the film strip.
  useEffect(() => {
    if (!mode) {
      const id = window.setTimeout(() => setPhase("done"));
      return () => window.clearTimeout(id);
    }
    (window as Window & { __lpIntro?: boolean }).__lpIntro = true;
    let cancelled = false;
    const push = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    if (reduced) {
      push(0, () => {
        setHello(greeting());
        setCounted(TICKLE_TITLES.length);
        setPhase(mode === "first" ? "ask" : "hello");
      });
    } else {
      const pop = leaderRef.current?.querySelector(".lp-leader__pop")?.getAnimations()[0];
      const ready = Promise.all([pop?.finished.catch(() => undefined), document.fonts?.ready, preload("/landing/filmstrip.jpg")]);
      const cap = new Promise((resolve) => window.setTimeout(resolve, 4000));
      Promise.race([ready, cap]).then(() => {
        if (cancelled) return;
        setHello(greeting());
        setPhase("hello");
        if (mode === "back") {
          push(1500, () => act.current.leave());
          return;
        }
        push(1150, () => setPhase("titles"));
        TICKLE_TITLES.forEach((_, i) => push(1300 + i * 130, () => setCounted(i + 1)));
        push(1150 + TICKLE_TITLES.length * 130 + 1000, () => setPhase("acronym"));
        push(1150 + TICKLE_TITLES.length * 130 + 2900, () => setPhase("ask"));
      });
    }
    return () => {
      cancelled = true;
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };
  }, [mode, reduced]);

  // While the intro is up, the page behind it is out of reach; Escape skips, Enter or Space hurries him along.
  const open = mode !== null && phase !== "leaving" && phase !== "done";
  useEffect(() => {
    if (!open) return;
    const targets = [document.getElementById("main"), document.querySelector<HTMLElement>(".lp-nav")];
    targets.forEach((el) => el?.setAttribute("inert", ""));
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        act.current.skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      targets.forEach((el) => el?.removeAttribute("inert"));
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (phase === "ask") fullRef.current?.focus({ preventScroll: true });
  }, [phase]);

  // He says hello from the middle of the frame, then steps aside when his titles arrive.
  useLayoutEffect(() => {
    const me = meRef.current;
    const panel = panelRef.current;
    if (phase !== "hello" || mode !== "first" || !me || !panel) return;
    const a = panel.getBoundingClientRect();
    const b = me.getBoundingClientRect();
    me.style.setProperty("--cx", `${Math.round(a.left + a.width / 2 - (b.left + b.width / 2))}px`);
  }, [phase, mode]);

  // The initials leave their titles and line up as an acronym.
  useLayoutEffect(() => {
    if (phase !== "acronym" || reduced) return;
    const initials = [...(titlesRef.current?.querySelectorAll<HTMLElement>("[data-initial]") ?? [])];
    const letters = [...(acroRef.current?.querySelectorAll<HTMLElement>("[data-letter]") ?? [])];
    letters.forEach((el, i) => {
      const to = el.getBoundingClientRect();
      const from = initials[i]?.getBoundingClientRect();
      if (!from || !to.height) return;
      const s = from.height / to.height;
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${s})` },
          { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 70}px) scale(${(s + 1) / 2}) rotate(-8deg)`, offset: 0.45 },
          { transform: "none" },
        ],
        { duration: 780, delay: i * 80, easing: "cubic-bezier(0.3, 0.7, 0.2, 1)", fill: "backwards" },
      );
    });
  }, [phase, reduced]);

  // A happy hop when he hears all of his titles.
  useEffect(() => {
    if (phase !== "react" || picked !== "full" || reduced) return;
    meRef.current?.animate(
      [
        { transform: "none" },
        { transform: "translateY(-46px) scale(0.94, 1.08)", offset: 0.35 },
        { transform: "translateY(0) scale(1.12, 0.88)", offset: 0.62 },
        { transform: "translateY(-10px)", offset: 0.8 },
        { transform: "none" },
      ],
      { duration: 760, easing: "ease-out" },
    );
  }, [phase, picked, reduced]);

  // The flight from the intro to the ribbon.
  useLayoutEffect(() => {
    const el = flierRef.current;
    if (!flight || !el) return;
    const { from, to } = flight;
    const s = to.width / from.width;
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    el.animate(
      [
        { transform: "none" },
        { transform: `translate(${dx * 0.5}px, ${Math.min(0, dy) * 0.5 - 120}px) scale(${(1 + s) / 2}) rotate(-12deg)`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${s})` },
      ],
      { duration: 780, easing: "cubic-bezier(0.45, 0, 0.2, 1)", fill: "forwards" },
    );
  }, [flight]);

  if (phase === "done") return null;

  // What he looks like and says at each moment.
  const ask = "Long, I know. What would you like to call me?";
  let mood: TickMood = "idle";
  let lcd: string | undefined;
  let say: string | undefined;
  let look: [number, number] | undefined;
  if (mode === "back") {
    if (choice === "short") {
      mood = "pout";
      say = "Oh. It’s you.";
    } else {
      mood = "hi";
      lcd = "HI";
      say = "Welcome back.";
    }
  } else if (phase === "hello") {
    mood = "hi";
    lcd = "HI";
    say = `${hello} Allow me to introduce myself.`;
  } else if (phase === "titles") {
    mood = "pass";
    lcd = counted ? String(counted) : "";
    say = `${hello} Allow me to introduce myself.`;
  } else if (phase === "acronym") {
    mood = "surprise";
    lcd = "!";
    say = `Oh no. That spells ${TICKLE_SHORT}.`;
    look = [1, 1];
  } else if (phase === "ask") {
    mood = hover?.on === "full" ? "hope" : hover?.on === "short" ? "worry" : "idle";
    lcd = hover?.on === "full" ? "♥" : "?";
    say = ask;
    look = hover?.look;
  } else if (phase === "react" || phase === "leaving") {
    if (picked === "full") {
      mood = "hope";
      lcd = "♥";
      say = `Thank you. All ${TICKLE_WORDS} words it is.`;
    } else if (picked === "short") {
      mood = "pout";
      say = `Six titles, and you picked ${TICKLE_SHORT}.`;
    } else {
      mood = "hi";
      lcd = "HI";
    }
  }

  // He looks at the option under the pointer or focus, hopeful for one and worried about the other.
  const aim = (e: React.PointerEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>) => {
    const on = e.currentTarget.dataset.opt === "full" ? "full" : "short";
    const me = e.currentTarget.closest(".lp-loader__intro")?.querySelector(".lp-loader__me canvas")?.getBoundingClientRect();
    const target = e.currentTarget.getBoundingClientRect();
    if (!me) return setHover({ on, look: [0, 1] });
    const dx = target.left + target.width / 2 - (me.left + me.width / 2);
    const dy = target.top + target.height / 2 - (me.top + me.height / 2);
    setHover({ on, look: [Math.abs(dx) > 60 ? Math.sign(dx) : 0, Math.abs(dy) > 60 ? Math.sign(dy) : 0] });
  };

  const size = narrow ? 136 : 232;
  const showTickle = phase !== "leader" || reduced;

  return (
    <div className="lp-loader" data-phase={phase} data-mode={mode ?? undefined} data-flight={flight ? "" : undefined}>
      <div
        ref={panelRef}
        className="lp-loader__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lp-intro-title"
        tabIndex={-1}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          if (mode === "back") act.current.leave();
          else if (SKIPPABLE.includes(phase) && phase !== "leader") act.current.forward();
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && phase !== "leader") {
            e.preventDefault();
            if (mode === "back") act.current.leave();
            else if (SKIPPABLE.includes(phase)) act.current.forward();
          }
        }}
      >
        <h2 id="lp-intro-title" className="sr-only">
          Meet Tickle, the stopwatch who checks the Reels on this page
        </h2>
        <p className="sr-only" aria-live="polite">
          {phase === "leader" ? "Loading." : say}
        </p>
        <span className="lp-loader__film lp-loader__film--l" aria-hidden="true" />
        <span className="lp-loader__film lp-loader__film--r" aria-hidden="true" />

        <div ref={leaderRef} className="lp-leader" aria-hidden="true">
          <svg viewBox="0 0 100 100" className="lp-leader__dial">
            <circle cx="50" cy="50" r="19" pathLength={100} className="lp-leader__sweep" transform="rotate(-90 50 50)" />
            <circle cx="50" cy="50" r="46" className="lp-leader__ring" />
            <circle cx="50" cy="50" r="38" className="lp-leader__ring" />
            <path d="M50 0V100M0 50H100" className="lp-leader__cross" />
          </svg>
          {["3", "2", "1"].map((n, k) => (
            <span key={n} className="lp-leader__n" style={{ "--k": k } as CSSProperties}>
              {n}
            </span>
          ))}
          <span className="lp-leader__pop" />
        </div>

        <div className="lp-loader__intro">
          <div ref={meRef} className="lp-loader__me">
            {showTickle && <Tick size={size} mood={mood} lcd={lcd} look={look} say={say} boot={phase === "hello"} outlined />}
            {phase === "react" && picked === "full" && !reduced && (
              <span className="lp-confetti" aria-hidden="true">
                {CONFETTI.map(([x, y, color], i) => (
                  <i key={i} style={{ "--x": `${x}px`, "--y": `${y}px`, "--c": `var(${color})`, "--d": `${i * 14}ms` } as CSSProperties} />
                ))}
              </span>
            )}
          </div>
          {mode !== "back" && (
            <div className="lp-loader__words">
              <p ref={titlesRef} className="lp-titles">
                {TICKLE_TITLES.map((t, i) => (
                  <span key={t.initial} className="lp-titles__line" style={{ "--i": i } as CSSProperties}>
                    <span className="lp-titles__i" data-initial="">
                      {t.initial}
                    </span>
                    {t.rest}
                    {i < TICKLE_TITLES.length - 2 ? "," : i === TICKLE_TITLES.length - 2 ? " and" : ""}
                  </span>
                ))}
              </p>
              <p ref={acroRef} className="lp-acro" aria-label={`${TICKLE_SHORT}, for short`}>
                {TICKLE_TITLES.map((t, i) => (
                  <span key={t.initial} aria-hidden="true">
                    <span className="lp-acro__l" data-letter="">
                      {t.initial}
                    </span>
                    <span className="lp-acro__dot" style={{ "--i": i } as CSSProperties}>
                      .
                    </span>
                  </span>
                ))}
              </p>
              <div className="lp-choose" role="group" aria-label="What should he be called?">
                <button
                  ref={fullRef}
                  type="button"
                  className="lp-opt lp-opt--full"
                  disabled={phase !== "ask"}
                  data-opt="full"
                  onClick={() => choose("full")}
                  onPointerEnter={aim}
                  onPointerLeave={() => setHover(null)}
                  onFocus={aim}
                  onBlur={() => setHover(null)}
                >
                  <span className="lp-opt__big">All {TICKLE_WORDS} words</span>
                  <span className="lp-opt__small">His full title</span>
                </button>
                <button
                  type="button"
                  className="lp-opt lp-opt--short"
                  disabled={phase !== "ask"}
                  data-opt="short"
                  onClick={() => choose("short")}
                  onPointerEnter={aim}
                  onPointerLeave={() => setHover(null)}
                  onFocus={aim}
                  onBlur={() => setHover(null)}
                >
                  <span className="lp-opt__big">{TICKLE_SHORT}</span>
                  <span className="lp-opt__small">{TICKLE_SHORT.length} letters</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {mode !== "back" && (
          <button type="button" className="lp-loader__skip lp-link" onClick={() => act.current.skip()}>
            Skip intro
          </button>
        )}
      </div>

      {flight && (
        <div
          ref={flierRef}
          className="lp-loader__flier"
          style={{ left: flight.from.left, top: flight.from.top, width: flight.from.width }}
          aria-hidden="true"
        >
          <Tick size={flight.from.width} mood={mood} lcd={lcd} outlined />
        </div>
      )}
    </div>
  );
}
