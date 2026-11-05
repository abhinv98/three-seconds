"use client";

import { Building2, CornerDownLeft, Film, LayoutDashboard, Search, Tag, Upload, Users, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Role } from "@/lib/account";
import { rankReels, type ReelHit } from "@/lib/reel-search";
import { cn } from "@/lib/utils";

// Cmd-K: go to any page or Reel. It opens and closes with no animation, because it's used from the keyboard. A native
// <dialog> traps focus, closes on Escape and sits in the top layer. The viewer's Reels load once, on the first open, so
// typing filters them with no request per key.

const OPEN_EVENT = "three-seconds:command-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

interface Page {
  href: string;
  label: string;
  icon: LucideIcon;
  words: string;
}

const PAGES: Record<Role, Page[]> = {
  brand: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard, words: "home kpi brand kit" },
    { href: "/dashboard/check", label: "Check a Reel", icon: Upload, words: "upload new" },
    { href: "/dashboard/reels", label: "Reels", icon: Film, words: "library folder" },
    { href: "/dashboard/connections", label: "Creators", icon: Users, words: "invite connections" },
    { href: "/dashboard/tools", label: "Label maker", icon: Tag, words: "hold calculator tools" },
  ],
  creator: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard, words: "home" },
    { href: "/dashboard/check", label: "Check a Reel", icon: Upload, words: "upload new" },
    { href: "/dashboard/reels", label: "My Reels", icon: Film, words: "library" },
    { href: "/dashboard/connections", label: "Brands", icon: Building2, words: "invite connections" },
    { href: "/dashboard/tools", label: "Label maker", icon: Tag, words: "hold calculator tools" },
  ],
};

const VERDICT_CLASS: Record<string, string> = {
  PASS: "bg-pass-surface text-pass-text",
  FAIL: "bg-fail-surface text-fail-text",
  REVIEW: "bg-review-surface text-review-text",
};

export function CommandPalette({ role }: { role: Role }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [reels, setReels] = useState<ReelHit[] | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/reels").catch(() => null);
    const body = (await response?.json().catch(() => null)) as { reels?: ReelHit[] } | null;
    setReels(body?.reels ?? []);
  }, []);

  const open = useCallback(() => {
    const el = dialog.current;
    if (!el || el.open) return;
    el.showModal();
    input.current?.select();
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else open();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, open);
    };
  }, [open]);

  const pages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PAGES[role].filter((p) => !q || `${p.label} ${p.words}`.toLowerCase().includes(q));
  }, [query, role]);
  const hits = useMemo(() => rankReels(reels ?? [], query).slice(0, 8), [reels, query]);
  const rows = useMemo(
    () => [...pages.map((p) => ({ key: p.href, href: p.href })), ...hits.map((r) => ({ key: r.id, href: `/dashboard/reels/${r.id}` }))],
    [pages, hits],
  );
  const current = rows.length ? Math.min(active, rows.length - 1) : -1;

  const go = (href: string) => {
    dialog.current?.close();
    router.push(href);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!rows.length) return;
      const next = (current + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
      setActive(next);
      list.current?.querySelector(`[data-row="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && current >= 0) {
      event.preventDefault();
      go(rows[current].href);
    }
  };

  return (
    <dialog
      ref={dialog}
      aria-label="Search pages and Reels"
      className="command-palette"
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current?.close();
      }}
      onClose={() => {
        setQuery("");
        setActive(0);
      }}
    >
      <div onKeyDown={onKeyDown} className="flex max-h-[min(560px,calc(100dvh-96px))] flex-col">
        <label className="flex h-13 shrink-0 items-center gap-3 border-b border-border px-4">
          <Search size={17} aria-hidden="true" className="shrink-0 text-muted-foreground" />
          <input
            ref={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={current >= 0 ? `${listId}-${current}` : undefined}
            aria-label="Search pages and Reels"
            placeholder="Search pages and Reels"
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground sm:text-[15px]"
          />
          <kbd className="hidden shrink-0 rounded-[4px] border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:block">esc</kbd>
        </label>
        <ul ref={list} id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-2">
          {pages.length ? <Heading>Pages</Heading> : null}
          {pages.map((page, i) => (
            <Row key={page.href} id={`${listId}-${i}`} index={i} active={current === i} onHover={setActive} onPick={() => go(page.href)}>
              <page.icon size={15} aria-hidden="true" className="shrink-0" />
              <span className="min-w-0 flex-1 truncate font-semibold">{page.label}</span>
            </Row>
          ))}
          {hits.length ? <Heading>Reels</Heading> : null}
          {hits.map((reel, i) => {
            const index = pages.length + i;
            return (
              <Row key={reel.id} id={`${listId}-${index}`} index={index} active={current === index} onHover={setActive} onPick={() => go(`/dashboard/reels/${reel.id}`)}>
                <Film size={15} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 flex-1 truncate font-semibold">{reel.filename}</span>
                <span className="hidden max-w-[140px] shrink-0 truncate text-[13px] text-muted-foreground sm:block">{reel.owner_name}</span>
                {reel.verdict ? (
                  <span className={cn("shrink-0 rounded-[4px] px-1.5 py-0.5 text-[11px] font-bold tracking-[0.06em]", VERDICT_CLASS[reel.verdict])}>{reel.verdict}</span>
                ) : null}
              </Row>
            );
          })}
          {!rows.length ? <li className="px-3 py-8 text-center text-sm text-muted-foreground">{reels ? "Nothing matches that." : "Loading your Reels."}</li> : null}
        </ul>
        <p className="flex shrink-0 items-center gap-3 border-t border-border px-4 py-2 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft size={12} aria-hidden="true" />
            open
          </span>
          <span>up and down to move</span>
        </p>
      </div>
    </dialog>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <li role="presentation" className="px-3 pt-2 pb-1 text-[12px] font-semibold text-muted-foreground">
      {children}
    </li>
  );
}

function Row({
  id,
  index,
  active,
  onHover,
  onPick,
  children,
}: {
  id: string;
  index: number;
  active: boolean;
  onHover: (index: number) => void;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      data-row={index}
      // onPointerMove, not enter: a list scrolling under a still pointer shouldn't move the selection.
      onPointerMove={() => {
        if (!active) onHover(index);
      }}
      onClick={onPick}
      className={cn("flex h-10 cursor-pointer items-center gap-3 rounded-[6px] px-3 text-sm", active && "bg-foreground text-background")}
    >
      {children}
    </li>
  );
}
