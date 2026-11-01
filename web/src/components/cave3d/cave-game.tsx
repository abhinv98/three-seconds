"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Pixel } from "@/components/landing/pixels";
import { drawTick } from "@/components/landing/tick";
import { readLock, writeLock, type CaveLock } from "@/lib/cave-lock";
import { formatCountdown, shiftEndLocal, untilSix, whereIsTickle } from "@/lib/ist";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import type { Game, Phase, Result } from "./engine";
import { HACKS, type HackKind } from "./hacks";
import { istDay } from "./maze";
import type { Sound } from "./sound";
import "./cave3d.css";

// The cave behind the website. On the landing page it opens behind the zipper (components/landing/zipper.tsx); at
// /cave it has its own gate: shut while Mr Tickle is at work (09:00 to 18:00 IST, weekdays), and shut after today's run
// until midnight IST.

type Gate = { kind: "open" } | { kind: "closed"; until: number } | { kind: "locked"; lock: CaveLock };

function readGate(now: number): Gate {
  const lock = readLock(now);
  if (lock) return { kind: "locked", lock };
  if (whereIsTickle(now, location.search) === "work") return { kind: "closed", until: now + untilSix(now) };
  return { kind: "open" };
}
const gateNow = () => {
  const now = Date.now();
  return { now, gate: readGate(now) };
};

/** The /cave page. */
export function CaveGame() {
  const [gate, setGate] = useState<{ now: number; gate: Gate } | null>(null);
  const [result, setResult] = useState<{ result: Result; lock: CaveLock } | null>(null);
  const [playing, setPlaying] = useState(false);

  const shut = gate !== null && gate.gate.kind !== "open" && !playing;
  useEffect(() => {
    const id = window.setTimeout(() => setGate(gateNow()), 0);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!shut) return;
    const id = window.setInterval(() => setGate(gateNow()), 1000);
    return () => window.clearInterval(id);
  }, [shut]);

  if (!gate)
    return (
      <main className="cv cv--quiet">
        <p className="cv-wait">Lighting a torch…</p>
      </main>
    );
  if (gate.gate.kind !== "open" && !playing) return <Closed gate={gate.gate} now={gate.now} />;
  return (
    <>
      <CavePlay
        mode="route"
        live
        onStart={() => setPlaying(true)}
        onEnd={(r) => setResult({ result: r, lock: writeLock(r.outcome, r.seconds) })}
      />
      {result && <Outcome result={result.result} lock={result.lock} />}
    </>
  );
}

function Closed({ gate, now }: { gate: Exclude<Gate, { kind: "open" }>; now: number }) {
  if (gate.kind === "closed")
    return (
      <main className="cv cv-gate" aria-labelledby="cv-gate-title">
        <Pixel art="doorClosed" cell={9} className="cv-gate__door" />
        <h1 id="cv-gate-title" className="cv-gate__title">
          This realm is closed.
        </h1>
        <p className="cv-gate__text">Mr Tickle is at work until 18:00 IST ({shiftEndLocal(now)} your time). Wait for his shift to end.</p>
        <p className="cv-countdown" role="timer" aria-label="Time until his shift ends">
          {formatCountdown(gate.until - now)}
        </p>
        <Link href="/" className="cv-link">
          Go and watch him work
        </Link>
        <p className="cv-gate__note">He works 09:00 to 18:00 IST, Monday to Friday. After six he goes home, behind the website.</p>
      </main>
    );
  const won = gate.lock.outcome === "won";
  return (
    <main className="cv cv-gate" aria-labelledby="cv-gate-title">
      <Pixel art={won ? "doorClosed" : "doorBoarded"} cell={9} className="cv-gate__door" />
      <h1 id="cv-gate-title" className="cv-gate__title">
        {won ? "You escaped. Once." : "Mr Tickle took the zipper."}
      </h1>
      <p className="cv-gate__text">
        {won
          ? "One trip through his dimension a day. The door opens again at midnight, India time."
          : "One trip through his dimension a day, and yours is over. He gives it back at midnight, India time."}
      </p>
      <p className="cv-countdown" role="timer" aria-label="Time until the cave opens again">
        {formatCountdown(gate.lock.until - now)}
      </p>
      <Link href="/" className="cv-link">
        Back to Three Seconds
      </Link>
    </main>
  );
}

type Say = { id: number; text: string };
const PAD = [
  ["ArrowUp", "Walk forward", "▲"],
  ["ArrowLeft", "Step left", "◀"],
  ["ArrowDown", "Walk back", "▼"],
  ["ArrowRight", "Step right", "▶"],
] as const;
const key = (type: "keydown" | "keyup") => window.dispatchEvent(new KeyboardEvent(type, { key: " " }));

/**
 * The game itself: the canvas, the effects the engine draws over it, and the HUD. On the landing page it sits behind
 * the website (`live` false) while the zipper opens, and starts when the zip is all the way down.
 */
export function CavePlay({
  mode,
  live,
  sound,
  onStart,
  onEnd,
  onLeave,
}: {
  mode: "route" | "landing";
  live: boolean;
  sound?: Sound;
  onStart?: () => void;
  onEnd: (result: Result) => void;
  /** On the landing page, leaving zips the website back up instead of following a link. */
  onLeave?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const endRef = useRef(onEnd);
  const reduced = useReducedMotion();
  const [ready, setReady] = useState<"loading" | "ready" | "failed">("loading");
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<Phase>("cave");
  const [hint, setHint] = useState<string | null>(null);
  const [narration, setNarration] = useState<Say | null>(null);
  const [caption, setCaption] = useState<Say | null>(null);
  const [live2, setLive] = useState("");
  const [muted, setMuted] = useState(false);
  const [items, setItems] = useState<HackKind[]>([]);
  const [dialog, setDialog] = useState<{ lines: string[]; resolve: () => void } | null>(null);
  const [cut, setCut] = useState<((kicked: boolean) => void) | null>(null);
  const [red, setRed] = useState(false);
  const [over, setOver] = useState(false);
  // What the HUD needs from the game, kept as state so render never reads the ref.
  const [kit, setKit] = useState<{ sound: Sound; touch: boolean } | null>(null);

  useEffect(() => {
    endRef.current = onEnd;
  });

  useEffect(() => {
    let game: Game | null = null;
    let cancelled = false;
    let n = 0;
    const onVisibility = () => game?.sound.pause(document.hidden);
    import("./engine")
      .then(({ Game }) => {
        if (cancelled || !canvasRef.current || !overlayRef.current) return;
        game = new Game(
          canvasRef.current,
          overlayRef.current,
          {
            hint: setHint,
            narrate: (text) => {
              setNarration({ id: ++n, text });
              setLive(text);
            },
            caption: (text, offscreen) => {
              if (offscreen) setCaption({ id: ++n, text });
              setLive(text);
            },
            dialog: (lines) => new Promise<void>((resolve) => setDialog({ lines, resolve })),
            cutscene: () => new Promise<boolean>((resolve) => setCut(() => resolve)),
            red: setRed,
            phase: setPhase,
            items: setItems,
            end: (result) => {
              setOver(true);
              setHint(null);
              endRef.current(result);
            },
          },
          { sound, day: istDay(Date.now()) },
        );
        game.touch = matchMedia("(pointer: coarse)").matches;
        gameRef.current = game;
        // ?debug=1 puts the game on window for poking at it from the console.
        if (/[?&]debug=1(&|$)/.test(location.search)) (window as unknown as { __cave?: Game }).__cave = game;
        document.addEventListener("visibilitychange", onVisibility);
        setKit({ sound: game.sound, touch: game.touch });
        setReady("ready");
      })
      .catch(() => setReady("failed"));
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      game?.dispose();
      gameRef.current = null;
    };
  }, [sound]);

  useEffect(() => {
    if (gameRef.current) gameRef.current.calm = reduced;
  }, [reduced, ready]);

  // On the landing page the game starts itself once the website is unzipped.
  useEffect(() => {
    if (mode !== "landing" || !live || ready !== "ready" || started) return;
    const id = window.setTimeout(() => {
      gameRef.current?.start();
      setStarted(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, [mode, live, ready, started]);

  // Subtitles stay up long enough to read, then go.
  useEffect(() => {
    if (!narration) return;
    const id = window.setTimeout(() => setNarration(null), 2600 + narration.text.length * 55);
    return () => window.clearTimeout(id);
  }, [narration]);
  useEffect(() => {
    if (!caption) return;
    const id = window.setTimeout(() => setCaption(null), 2200 + caption.text.length * 45);
    return () => window.clearTimeout(id);
  }, [caption]);

  const enter = () => {
    const game = gameRef.current;
    if (!game) return;
    game.start();
    setStarted(true);
    onStart?.();
    canvasRef.current?.focus();
  };
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    gameRef.current?.sound.setMuted(next);
  };
  const press = (k: string, down: boolean) => gameRef.current?.press(k, down);
  const playing = started && live && !over;
  const action = phase === "showdown" || phase === "cutscene" ? "KICK" : phase === "chase" ? "USE" : null;

  return (
    <main className="cv3" data-mode={mode} data-live={live || undefined} data-phase={phase}>
      <canvas
        ref={canvasRef}
        className="cv3-canvas"
        tabIndex={-1}
        aria-label="A cave behind the website, and a door at the back of it. Walk with the arrow keys or W A S D, drag to look."
      />
      <div ref={overlayRef} className="cv3-fx" aria-hidden="true" />

      {playing && (
        <div className="cv3-hud">
          {onLeave ? (
            <button type="button" className="cv3-chip" onClick={onLeave}>
              ← Leave
            </button>
          ) : (
            <Link href="/" className="cv3-chip">
              ← Leave
            </Link>
          )}
          <button type="button" className="cv3-chip" aria-pressed={muted} onClick={toggleMute}>
            {muted ? "Sound off" : "Sound on"}
          </button>
        </div>
      )}
      {hint && playing && !dialog && (
        <p key={hint} className="cv3-hint">
          {hint}
        </p>
      )}
      {narration && live && !dialog && !over && !cut && !red && (
        <p key={narration.id} className="cv3-narrator">
          {narration.text}
        </p>
      )}
      {caption && playing && (
        <p key={caption.id} className="cv3-caption">
          {caption.text}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {live2}
      </p>

      {items.length > 0 && playing && (
        <div className="cv3-items" aria-label="Hacks you are carrying">
          {items.map((k, i) => (
            <span key={`${k}-${i}`} className="cv3-item" style={{ "--hack": HACKS[k].color } as React.CSSProperties} data-next={i === 0 || undefined}>
              {HACKS[k].label}
            </span>
          ))}
          <span className="cv3-items__key">{kit?.touch ? "tap USE" : "SPACE"}</span>
        </div>
      )}

      {playing && (
        <div className="cv3-pad" aria-hidden="true">
          {PAD.map(([k, label, glyph]) => (
            <button
              key={k}
              type="button"
              aria-label={label}
              data-key={k}
              onPointerDown={() => press(k, true)}
              onPointerUp={() => press(k, false)}
              onPointerLeave={() => press(k, false)}
              onPointerCancel={() => press(k, false)}
              onContextMenu={(e) => e.preventDefault()}
            >
              {glyph}
            </button>
          ))}
        </div>
      )}
      {playing && action && (
        <button type="button" className="cv3-act" aria-label={action === "KICK" ? "Kick" : "Use a hack"} onPointerDown={() => key("keydown")} onPointerUp={() => key("keyup")}>
          {action}
        </button>
      )}

      {dialog && !over && <Dialog lines={dialog.lines} sound={kit?.sound} onDone={() => (dialog.resolve(), setDialog(null))} />}
      {cut && <Cutscene sound={kit?.sound} touch={!!kit?.touch} onDone={(kicked) => (cut(kicked), setCut(null))} />}
      {red && (
        <section className="cv3-red" role="alert">
          <h1 className="cv3-red__title">You hesitated.</h1>
          <p className="cv3-red__text">Go back and check your Reels. You are no match for the Tickle family.</p>
        </section>
      )}

      {mode === "route" && !started && (
        <section className="cv3-title" aria-labelledby="cv3-title">
          <h1 id="cv3-title" className="cv3-title__name">
            Mr Tickle has gone home.
          </h1>
          <p className="cv3-title__text">Behind the website there is a cave, and at the back of the cave there is a door. Go through it.</p>
          {ready === "failed" ? (
            <p className="cv3-title__text">This browser can’t draw the cave (WebGL is off). Try another browser.</p>
          ) : (
            <button type="button" className="cv-button" disabled={ready !== "ready"} onClick={enter}>
              {ready === "ready" ? "Step into the cave" : "Lighting a torch…"}
            </button>
          )}
          <p className="cv3-title__keys" data-for="mouse">
            Sound on. Arrow keys or WASD to walk, Shift to hurry, drag to look, Space to act.
          </p>
          <p className="cv3-title__keys" data-for="touch">
            Sound on. Walk with the pad, drag the screen to look.
          </p>
        </section>
      )}
    </main>
  );
}

/** The indie dialogue box: typed out a letter at a time, with a blip; Space, Enter or a tap moves it on. */
function Dialog({ lines, sound, onDone }: { lines: string[]; sound?: Sound; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(0);
  const line = lines[i] ?? "";
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  useEffect(() => {
    if (shown >= line.length) return;
    const id = window.setTimeout(() => {
      setShown((s) => s + 1);
      if (shown % 2 === 0 && /\S/.test(line[shown] ?? "")) sound?.blip(i === 0 ? 1.15 : 1);
    }, 26);
    return () => window.clearTimeout(id);
  }, [shown, line, sound, i]);
  const next = () => {
    if (shown < line.length) return setShown(line.length);
    if (i + 1 < lines.length) {
      setI(i + 1);
      setShown(0);
    } else doneRef.current();
  };
  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.key !== " " && e.key !== "Enter")) return;
      e.preventDefault();
      nextRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <section className="cv3-dialog" role="dialog" aria-label="The cave speaks" onPointerDown={() => next()}>
      <span className="cv3-dialog__face" aria-hidden="true">
        <span />
        <span />
      </span>
      <div className="cv3-dialog__body">
        <p className="cv3-dialog__who">???</p>
        <p className="cv3-dialog__text" aria-live="polite">
          {line.slice(0, shown)}
          {shown >= line.length && <span className="cv3-dialog__more" aria-hidden="true" />}
        </p>
      </div>
    </section>
  );
}

/** The littlest Tickle looks up at you. Keep kicking (tap Space) through it, or hesitate. */
function Cutscene({ sound, touch, onDone }: { sound?: Sound; touch: boolean; onDone: (kicked: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meterRef = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<"plead" | "hesitated" | "kicked">("plead");
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let resolve = 0.6;
    let outcome: "plead" | "hesitated" | "kicked" = "plead";
    let endAt = 0;
    const start = performance.now();
    let last = start;
    let frame = 0;
    const tap = () => {
      if (outcome !== "plead") return;
      resolve = Math.min(1, resolve + 0.14);
      sound?.kick(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || e.repeat) return;
      e.preventDefault();
      tap();
    };
    const onPointer = () => tap();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    const loop = () => {
      const now = performance.now();
      const t = (now - start) / 1000;
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      if (outcome === "plead") {
        resolve -= dt * 0.5;
        if (resolve <= 0) {
          outcome = "hesitated";
          endAt = now + 900;
          setState("hesitated");
          sound?.roar();
        } else if (t > 3.4) {
          outcome = "kicked";
          endAt = now + 500;
          setState("kicked");
        }
      }
      if (meterRef.current) meterRef.current.style.transform = `scaleX(${Math.max(0, resolve)})`;
      drawTick(
        ctx,
        outcome === "hesitated" ? { mood: "spooky", lcd: "NO", variant: "kid" } : { mood: "puppy", variant: "kid", look: [0, -1] },
        t,
        false,
        false,
      );
      if (endAt && now > endAt) return doneRef.current(outcome === "kicked");
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [sound]);
  return (
    <section className="cv3-cut" data-state={state} aria-label="Tock looks up at you">
      <div className="cv3-cut__face">
        <canvas ref={canvasRef} width={48} height={48} />
        {state === "plead" && <p className="cv3-cut__say">…please?</p>}
      </div>
      <div className="cv3-cut__prompt">
        <p>{state === "plead" ? (touch ? "Keep tapping to kick." : "Keep tapping SPACE to kick.") : state === "kicked" ? "KICK." : "He saw you hesitate."}</p>
        <span className="cv3-cut__meter">
          <span ref={meterRef} />
        </span>
      </div>
    </section>
  );
}

/** How it ended, at /cave: what you did, when the door opens again, and a way to tell people. */
function Outcome({ result, lock }: { result: Result; lock: CaveLock }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const s = result.seconds.toFixed(1);
  const title = result.outcome === "won" ? "You escaped." : result.outcome === "caught" ? "Mr Tickle got you." : "You hesitated.";
  const text =
    result.outcome === "won"
      ? `With ${s} seconds to spare. He will remember that.`
      : result.outcome === "caught"
        ? `You lasted ${s} seconds in his dimension.`
        : "The littlest one looked up at you, and you blinked first.";
  const share =
    result.outcome === "won"
      ? `I escaped Mr Tickle’s dimension with ${s} seconds to spare.`
      : result.outcome === "caught"
        ? `Mr Tickle caught me after ${s} seconds.`
        : "I hesitated. Mr Tickle’s littlest did not.";
  return (
    <section className="cv3-out" aria-labelledby="cv3-out-title">
      <h1 id="cv3-out-title" className="cv3-out__title">
        {title}
      </h1>
      <p className="cv3-out__text">{text}</p>
      <ol className="cv3-log" aria-label="What you did">
        {recap(result.log).map(({ line, times }, i) => (
          <li key={i}>
            {line.replace(/^The visitor /, "You ")}
            {times > 1 && ` (${times} times)`}
          </li>
        ))}
      </ol>
      <p className="cv3-out__text">
        The cave opens again in <span className="cv3-out__time">{formatCountdown(lock.until - now)}</span>.
      </p>
      <div className="cv3-out__actions">
        <Link href="/check" className="cv-button">
          Check a Reel
        </Link>
        <a
          className="cv-button cv-button--quiet"
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(share)}&url=${encodeURIComponent(location.origin)}`}
          target="_blank"
          rel="noreferrer"
        >
          Share on X
        </a>
        <Link href="/" className="cv-link">
          Back to Three Seconds
        </Link>
      </div>
    </section>
  );
}

/** The log with repeats folded: "You poked Ms Tickle. (3 times)". */
function recap(log: string[]) {
  const out: { line: string; times: number }[] = [];
  for (const line of log) {
    const last = out[out.length - 1];
    if (last?.line === line) last.times += 1;
    else out.push({ line, times: 1 });
  }
  return out;
}
