"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ASCI_SOURCE_URL, formatHold, requiredHold } from "@/lib/asci";
import { formatBytes, formatSeconds } from "@/lib/format";
import { ACCEPT_ATTRIBUTE, contentTypeFor, MAX_BYTES, MAX_DURATION_S } from "@/lib/limits";
import { setPendingUpload } from "@/lib/pending-upload";
import { chooseName, TICKLE_SHORT, TICKLE_WORDS, useTickleChoice } from "@/lib/tickle";
import { Tick, type TickPose } from "./tick";

const IDLE_NOTE =
  "Choose or drop an MP4 or MOV, up to 90 seconds and 100 MB. The report shows the verdict, the evidence and the fix.";

/**
 * The closing sentence: its blank is the file picker, its last word sends the Reel to /check. Tickle watches the
 * blank, and once a file is in it he reads its length here in the browser and works out the hold it will need.
 */
function CheckSentence() {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  // undefined while the length is being read, null when the browser can't read it
  const [length, setLength] = useState<number | null | undefined>(undefined);
  const [dragging, setDragging] = useState(false);

  const pick = (chosen: File) => {
    setFile(chosen);
    setLength(undefined);
  };

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => setLength(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => setLength(null);
    video.src = url;
    return () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [file]);

  let pose: TickPose = { mood: dragging ? "read" : "point", lcd: "3.0", look: [-1, 0] };
  let say: string | undefined = dragging ? "Drop it on the blank." : undefined;
  let note = IDLE_NOTE;
  let usable = Boolean(file);
  if (file) {
    if (!contentTypeFor(file)) {
      usable = false;
      pose = { mood: "review", lcd: "?", card: "review" };
      say = "I only read MP4 and MOV.";
      note = `${file.name} isn’t an MP4 or MOV. Choose another file.`;
    } else if (file.size > MAX_BYTES) {
      usable = false;
      pose = { mood: "review", lcd: "?", card: "review" };
      say = "Too heavy for me.";
      note = `This file is ${formatBytes(file.size)}; the limit is 100 MB.`;
    } else if (length === undefined) {
      pose = { mood: "read", lcd: "0.0" };
      note = "Reading its length…";
    } else if (length === null) {
      pose = { mood: "count", lcd: "0.0" };
      say = "Ready when you are.";
      note = "Ready. Press “clock” to start the check.";
    } else if (length > MAX_DURATION_S + 0.05) {
      usable = false;
      pose = { mood: "worry", lcd: "?" };
      say = "Ninety seconds is my limit.";
      note = `This one is ${formatSeconds(length)}. Checks run on videos up to 90 seconds; trim it and choose it again.`;
    } else {
      const need = requiredHold(length).seconds;
      pose = { mood: "count", lcd: formatHold(need).replace("s", "") };
      say = `${formatSeconds(length)} long. I need the label for ${formatHold(need)}.`;
      note = `Your Reel is ${formatSeconds(length)} long, so the label has to stay ${formatHold(need)} in one stretch. Press “clock” to check it.`;
    }
  }

  const send = () => {
    if (!file || !usable) return inputRef.current?.click();
    setPendingUpload(file);
    router.push("/check");
  };

  return (
    <div className="lp-cta">
      <div className="lp-cta__tick" aria-hidden="true">
        <Tick size={176} outlined pokeable say={say} {...pose} />
      </div>
      <p className="lp-cta__sentence" data-rv="0">
        <span>Put </span>
        <label
          htmlFor={inputId}
          className="lp-cta__blank"
          data-filled={file ? "" : undefined}
          data-dragging={dragging || undefined}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) pick(dropped);
          }}
        >
          {file ? file.name : "your next Reel"}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          aria-label="Choose a Reel or Short to check"
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            e.target.value = "";
            if (chosen) pick(chosen);
          }}
        />
        <br />
        <span>on the </span>
        <button
          type="button"
          className="lp-cta__go"
          onClick={send}
          aria-label={file && usable ? `Check ${file.name}` : file ? "Choose another Reel" : "Choose a Reel to check"}
        >
          clock
        </button>
        <span>.</span>
      </p>
      <p className="lp-cta__note" data-rv="1" aria-live="polite">
        {note}
      </p>
    </div>
  );
}

/**
 * The name, set as large as the page allows, with Tickle asleep on it. Waking him gets a line that depends on what the
 * visitor called him, and a last chance to use his full title if they didn't.
 */
function Wordmark() {
  const choice = useTickleChoice();
  const [awake, setAwake] = useState(false);
  const [thanked, setThanked] = useState<"finally" | "first" | null>(null);
  const timer = useRef(0);
  useEffect(() => {
    const t = timer;
    return () => window.clearTimeout(t.current);
  }, []);
  const stayAwake = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAwake(false), 9000);
  };
  const sulking = choice === "short";
  const line = !awake
    ? undefined
    : thanked === "finally"
      ? "Thank you. Finally."
      : thanked === "first"
        ? `Thank you. All ${TICKLE_WORDS} words it is.`
        : sulking
          ? `Still ${TICKLE_SHORT}, is it?`
          : choice === "full"
            ? `At your service. All ${TICKLE_WORDS} words of me.`
            : `We skipped the introductions. I’m ${TICKLE_SHORT}.`;
  const pose: TickPose = !awake
    ? { mood: "sleep" }
    : thanked
      ? { mood: "hope", lcd: "♥" }
      : sulking
        ? { mood: "pout" }
        : { mood: "hi", lcd: "HI" };

  return (
    <div className="lp-mark">
      {/* The cave is the hole in the "o" of Seconds: Tickle's eyes glow in it once he is home. */}
      <p className="lp-mark__word">
        <span aria-hidden="true">Three Sec</span>
        <span className="lp-mark__o">
          <span aria-hidden="true">o</span>
          <Link href="/cave" className="lp-cave" aria-label="Enter the cave">
            <span className="lp-cave__eyes" aria-hidden="true" />
            <span className="lp-cave__tip" data-when="work" aria-hidden="true">
              Enter the cave
            </span>
            <span className="lp-cave__tip" data-when="home" aria-hidden="true">
              Tickle is home. Enter the cave
            </span>
          </Link>
        </span>
        <span aria-hidden="true">nds</span>
      </p>
      <div className="lp-mark__tick">
        {awake && choice !== "full" && !thanked && (
          <button
            type="button"
            className="lp-mark__rename"
            onClick={() => {
              setThanked(sulking ? "finally" : "first");
              chooseName("full");
              stayAwake();
            }}
          >
            Call him by his full title
          </button>
        )}
        <button
          type="button"
          className="lp-mark__wake"
          aria-label={awake ? "Let Tickle sleep" : "Wake Tickle"}
          onClick={() => {
            if (awake) {
              setAwake(false);
              return;
            }
            setAwake(true);
            setThanked(null);
            stayAwake();
          }}
        >
          <Tick size={120} outlined say={line} {...pose} />
        </button>
        <p className="sr-only" aria-live="polite">
          {line ?? ""}
        </p>
      </div>
    </div>
  );
}

export function Closing() {
  return (
    <>
      <section className="lp-sheet lp-close" aria-labelledby="close-title">
        <h2 id="close-title" className="sr-only">
          Check your next Reel
        </h2>
        <CheckSentence />
      </section>
      <footer className="lp-foot2">
        <Wordmark />
        <div className="lp-foot">
          <p className="lp-foot__what">Ad-disclosure checks for creator Reels</p>
          <nav aria-label="Footer" className="lp-foot__links">
            <Link href="/report/sample" className="lp-link">
              Sample report
            </Link>
            <a href={ASCI_SOURCE_URL} target="_blank" rel="noreferrer" className="lp-link">
              The ASCI guideline
            </a>
            <Link href="/check" className="lp-link">
              Check an ad
            </Link>
          </nav>
          <p className="lp-foot__year">© 2026. Not legal advice.</p>
        </div>
        {/* The ground the page stands on. */}
        <div className="lp-ground" />
      </footer>
    </>
  );
}
