"use client";

import { Check, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";

// toast("Saved") from anywhere; <Toaster /> sits once in the dashboard layout. CSS transitions (.toast in globals.css),
// so toasts added in a burst retarget instead of restarting. After Emil Kowalski's Sonner.

type Tone = "ok" | "fail";

interface Item {
  id: number;
  message: string;
  tone?: Tone;
  left: number;
  closing: boolean;
}

const LIFETIME_MS = 5000;
const EXIT_MS = 200;
const TICK_MS = 100;
const SWIPE_DISTANCE = 56;
const SWIPE_VELOCITY = 0.11;

let items: Item[] = [];
let lastId = 0;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const NONE: Item[] = [];

export function toast(message: string, options?: { tone?: Tone }): void {
  items = [{ id: ++lastId, message, tone: options?.tone, left: LIFETIME_MS, closing: false }, ...items];
  publish();
}

function dismiss(id: number) {
  items = items.map((item) => (item.id === id ? { ...item, closing: true } : item));
  publish();
  window.setTimeout(() => {
    items = items.filter((item) => item.id !== id);
    publish();
  }, EXIT_MS);
}

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => NONE);
  const hovered = useRef(false);

  // One clock for the whole stack. It stops while the pointer is on the stack or the tab is hidden.
  useEffect(() => {
    if (!list.length) return;
    const timer = window.setInterval(() => {
      if (hovered.current || document.hidden) return;
      for (const item of items) {
        item.left -= TICK_MS;
        if (item.left <= 0 && !item.closing) dismiss(item.id);
      }
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [list.length]);

  const live = list.filter((item) => !item.closing);
  return (
    <section
      aria-label="Notifications"
      className="toaster"
      onPointerEnter={() => {
        hovered.current = true;
      }}
      onPointerLeave={() => {
        hovered.current = false;
      }}
    >
      {list.map((item) => (
        <Toast key={item.id} item={item} index={Math.max(0, live.indexOf(item))} />
      ))}
    </section>
  );
}

function Toast({ item, index }: { item: Item; index: number }) {
  const drag = useRef<{ x: number; y: number; at: number; pointer: number } | null>(null);

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || event.pointerId !== drag.current.pointer) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    // Sideways either way, or down. Up is where the stack is, so it drags with friction.
    const y = dy < 0 ? dy * 0.15 : dy;
    event.currentTarget.style.transform = `translate3d(${dx}px, ${y}px, 0)`;
  };

  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || event.pointerId !== drag.current.pointer) return;
    const el = event.currentTarget;
    const dx = event.clientX - drag.current.x;
    const dy = Math.max(0, event.clientY - drag.current.y);
    const moved = Math.max(Math.abs(dx), dy);
    const velocity = moved / Math.max(1, performance.now() - drag.current.at);
    drag.current = null;
    el.removeAttribute("data-dragging");
    if (moved >= SWIPE_DISTANCE || (moved > 8 && velocity > SWIPE_VELOCITY)) {
      el.style.transform = Math.abs(dx) > dy ? `translate3d(${dx > 0 ? 110 : -110}%, 0, 0)` : "translate3d(0, 110%, 0)";
      dismiss(item.id);
    } else {
      el.style.transform = "";
    }
  };

  return (
    <div
      role={item.tone === "fail" ? "alert" : "status"}
      className={cn("toast", item.tone === "fail" && "toast-fail")}
      data-closing={item.closing || undefined}
      data-hidden={index > 2 || undefined}
      style={{ "--i": index } as React.CSSProperties}
      onPointerDown={(event) => {
        if (drag.current || event.button !== 0) return;
        drag.current = { x: event.clientX, y: event.clientY, at: performance.now(), pointer: event.pointerId };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.setAttribute("data-dragging", "");
      }}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
    >
      {item.tone === "fail" ? (
        <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      ) : item.tone === "ok" ? (
        <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      ) : null}
      <span className="line-clamp-2 min-w-0">{item.message}</span>
    </div>
  );
}
