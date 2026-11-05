"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { Clock } from "./clock";
import { clamp, EDIT_FPS } from "./geometry";

export interface LoopRange {
  start: number;
  end: number;
}

/** A browser can't play a video backwards, so J seeks back by this much at a time. */
const REVERSE_STEP_S = 0.1;
const SPEEDS = [0.5, 1, 2];

/** Everything that moves the playhead. The video is the only source of the time; this only tells it what to do. */
export function useTransport(videoRef: RefObject<HTMLVideoElement | null>, clock: Clock, duration: number) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loop, setLoopState] = useState<LoopRange | null>(null);
  const loopRef = useRef<LoopRange | null>(null);
  const reversing = useRef(false);

  const setLoop = useCallback((range: LoopRange | null) => {
    loopRef.current = range;
    setLoopState(range);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = (t: number) => {
      const range = loopRef.current;
      if (range && !video.paused && t >= range.end - 0.01) {
        video.currentTime = range.start;
        clock.set(range.start);
        return;
      }
      clock.set(t);
    };
    let frameHandle = 0;
    let rafHandle = 0;
    if ("requestVideoFrameCallback" in video) {
      const tick = (_: number, meta: { mediaTime: number }) => {
        onTime(meta.mediaTime);
        frameHandle = video.requestVideoFrameCallback(tick);
      };
      frameHandle = video.requestVideoFrameCallback(tick);
    } else {
      const tick = () => {
        if (!(video as HTMLVideoElement).paused) onTime((video as HTMLVideoElement).currentTime);
        rafHandle = requestAnimationFrame(tick);
      };
      rafHandle = requestAnimationFrame(tick);
    }
    const sync = () => {
      if (reversing.current) return;
      clock.set(video.currentTime);
    };
    const play = () => setPlaying(true);
    const pause = () => setPlaying(false);
    const ended = () => {
      const range = loopRef.current;
      if (!range) return;
      video.currentTime = range.start;
      void video.play().catch(() => {});
    };
    video.addEventListener("seeked", sync);
    video.addEventListener("loadedmetadata", sync);
    video.addEventListener("play", play);
    video.addEventListener("pause", pause);
    video.addEventListener("ended", ended);
    return () => {
      if ("cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(frameHandle);
      cancelAnimationFrame(rafHandle);
      video.removeEventListener("seeked", sync);
      video.removeEventListener("loadedmetadata", sync);
      video.removeEventListener("play", play);
      video.removeEventListener("pause", pause);
      video.removeEventListener("ended", ended);
    };
  }, [videoRef, clock]);

  const stopReverse = useCallback(() => {
    reversing.current = false;
  }, []);

  const seek = useCallback(
    (t: number, keepLoop = false) => {
      stopReverse();
      const video = videoRef.current;
      const next = clamp(t, 0, duration || video?.duration || 0);
      const range = loopRef.current;
      if (range && !keepLoop && (next < range.start - 0.02 || next > range.end + 0.02)) setLoop(null);
      clock.set(next);
      if (!video) return;
      try {
        video.currentTime = next;
      } catch {
        // Not seekable until its metadata loads; the playhead still moves.
      }
    },
    [videoRef, clock, duration, setLoop, stopReverse],
  );

  const play = useCallback(() => {
    stopReverse();
    void videoRef.current?.play().catch(() => {});
  }, [videoRef, stopReverse]);

  const pause = useCallback(() => {
    stopReverse();
    videoRef.current?.pause();
  }, [videoRef, stopReverse]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused && !reversing.current) play();
    else pause();
  }, [videoRef, play, pause]);

  const stepFrame = useCallback(
    (direction: 1 | -1) => {
      pause();
      const frame = Math.round(clock.t * EDIT_FPS) + direction;
      // A hair into the frame, so rounding can't land on the one before.
      seek((frame + 0.05) / EDIT_FPS, true);
    },
    [clock, pause, seek],
  );

  const setSpeed = useCallback(
    (value: number) => {
      const video = videoRef.current;
      if (video) video.playbackRate = value;
      setSpeedState(value);
    },
    [videoRef],
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }, [videoRef]);

  /** L: forward, and each press after that a step faster. */
  const shuttleForward = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || reversing.current) {
      setSpeed(1);
      play();
      return;
    }
    const at = SPEEDS.indexOf(video.playbackRate);
    setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, at + 1)]);
  }, [videoRef, play, setSpeed]);

  /** J: backwards until something else moves the playhead. */
  const shuttleBack = useCallback(() => {
    const video = videoRef.current;
    if (!video || reversing.current) return;
    video.pause();
    reversing.current = true;
    const back = () => {
      if (!reversing.current) return;
      const started = performance.now();
      const next = video.currentTime - REVERSE_STEP_S;
      if (next <= 0) {
        reversing.current = false;
        video.currentTime = 0;
        clock.set(0);
        return;
      }
      video.currentTime = next;
      clock.set(next);
      // Decoding can outrun real time, and backwards at normal speed is what J promises.
      video.addEventListener("seeked", () => setTimeout(back, Math.max(0, REVERSE_STEP_S * 1000 - (performance.now() - started))), { once: true });
    };
    back();
  }, [videoRef, clock]);

  return { playing, speed, muted, loop, setLoop, seek, play, pause, toggle, stepFrame, setSpeed, toggleMute, shuttleForward, shuttleBack };
}

export type Transport = ReturnType<typeof useTransport>;
