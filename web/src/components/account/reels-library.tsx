"use client";

import { LayoutGrid, List, Search, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ReelStatus, when } from "@/components/account/bits";
import { ReelThumb } from "@/components/account/reel-thumb";
import { ReviewBadge } from "@/components/review/review-panel";
import { Button } from "@/components/ui/button";
import { filterReels, libraryUrl, NO_FILTER, parseLibraryQuery, type LibraryQuery, type LibraryReel, type SortKey, type StateFilter, type VerdictWord } from "@/lib/reel-search";
import { cn } from "@/lib/utils";

const VERDICTS: { value: VerdictWord | ""; word: string }[] = [
  { value: "", word: "All" },
  { value: "FAIL", word: "Fail" },
  { value: "REVIEW", word: "Review" },
  { value: "PASS", word: "Pass" },
];

const SELECT = "h-8 max-w-full min-w-0 rounded-[6px] border border-border bg-card px-2 text-[13px] font-semibold";

export function ReelsLibrary({ reels, brandView }: { reels: LibraryReel[]; brandView: boolean }) {
  const params = useSearchParams();
  const [query, setQuery] = useState(() => parseLibraryQuery(params));
  const [view, setView] = useState<"grid" | "list">(params.get("view") === "list" ? "list" : "grid");

  // A link to this page (the rail, the palette) changes the URL without remounting, and then the URL wins. The router
  // shows this component's own writes a little late, so while one is on its way an older URL isn't a link.
  const [seenParams, setSeenParams] = useState(params);
  const [writing, setWriting] = useState(false);
  if (params !== seenParams) {
    setSeenParams(params);
    if (params.toString() === libraryUrl(query, view).slice(1)) {
      setWriting(false);
    } else if (!writing) {
      setQuery(parseLibraryQuery(params));
      setView(params.get("view") === "list" ? "list" : "grid");
    }
  }

  const update = (next: Partial<LibraryQuery>, nextView = view) => {
    const merged = { ...query, ...next };
    const url = libraryUrl(merged, nextView);
    setQuery(merged);
    setView(nextView);
    if (url !== window.location.search) setWriting(true);
    // Into the URL with no server round trip, so Back from a Reel returns to this exact view.
    window.history.replaceState(null, "", `${window.location.pathname}${url}`);
  };

  const shown = useMemo(() => filterReels(reels, query), [reels, query]);
  const counts = useMemo(() => {
    const scoped = filterReels(reels, { ...query, verdict: "" });
    return { "": scoped.length, FAIL: scoped.filter((r) => r.verdict === "FAIL").length, REVIEW: scoped.filter((r) => r.verdict === "REVIEW").length, PASS: scoped.filter((r) => r.verdict === "PASS").length };
  }, [reels, query]);
  const creators = useMemo(() => [...new Map(reels.map((r) => [r.owner_id, r.owner_name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [reels]);
  const filtered = query.q || query.verdict || query.state || query.creator;

  return (
    <div className="grid gap-4">
      <div className="grid gap-2.5">
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1 sm:max-w-[360px]">
            <span className="sr-only">Search Reels by file name, creator or verdict</span>
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query.q}
              onChange={(event) => update({ q: event.target.value })}
              placeholder="Search file name, creator or verdict"
              className="h-9 w-full rounded-[6px] border border-input bg-card pr-3 pl-8 text-[16px] outline-none placeholder:text-muted-foreground sm:text-sm"
            />
          </label>
          <div role="group" aria-label="View" className="ml-auto flex shrink-0 rounded-[6px] border border-border bg-card p-0.5">
            <ViewButton active={view === "grid"} label="Grid" onClick={() => update({}, "grid")}>
              <LayoutGrid size={15} aria-hidden="true" />
            </ViewButton>
            <ViewButton active={view === "list"} label="List" onClick={() => update({}, "list")}>
              <List size={15} aria-hidden="true" />
            </ViewButton>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div role="group" aria-label="Filter by verdict" className="flex gap-1">
            {VERDICTS.map(({ value, word }) => (
              <button
                key={word}
                type="button"
                aria-pressed={query.verdict === value}
                onClick={() => update({ verdict: value })}
                className={cn(
                  "filter-chip inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] font-semibold",
                  query.verdict === value ? "bg-foreground text-background" : "text-muted-foreground",
                )}
              >
                {word}
                <span className="font-mono text-[11px] tabular-nums opacity-70">{counts[value]}</span>
              </button>
            ))}
          </div>
          <label className="contents">
            <span className="sr-only">Approval</span>
            <select value={query.state} onChange={(event) => update({ state: event.target.value as StateFilter })} className={SELECT}>
              <option value="">Any approval</option>
              <option value="waiting">Waiting for an answer</option>
              <option value="approved">Approved</option>
              <option value="changes">Changes requested</option>
            </select>
          </label>
          {brandView && creators.length > 1 ? (
            <label className="contents">
              <span className="sr-only">Creator</span>
              <select value={query.creator} onChange={(event) => update({ creator: event.target.value })} className={SELECT}>
                <option value="">Every creator</option>
                {creators.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="contents">
            <span className="sr-only">Sort</span>
            <select value={query.sort} onChange={(event) => update({ sort: event.target.value as SortKey })} className={SELECT}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="worst">Worst first</option>
              <option value="name">By name</option>
            </select>
          </label>
          <p aria-live="polite" className="ml-auto text-[13px] text-muted-foreground tabular-nums">
            {shown.length} of {reels.length}
          </p>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-[10px] border border-dashed border-input px-6 py-14 text-center">
          <p className="text-[15px] font-bold">No Reels match that.</p>
          {filtered ? (
            <Button type="button" variant="outline" size="compact" onClick={() => update({ ...NO_FILTER, sort: query.sort })}>
              <X size={15} aria-hidden="true" />
              Clear the filters
            </Button>
          ) : null}
        </div>
      ) : view === "grid" ? (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
          {shown.map((reel) => (
            <li key={reel.id} className="min-w-0">
              <Link href={`/dashboard/reels/${reel.id}`} className="reel-card group block rounded-[8px]">
                <div className="relative">
                  <ReelThumb reelId={reel.id} hasPoster={reel.hasPoster} scrub className="rounded-[8px]" />
                  {/* At the bottom: the top left is where a Reel's own Paid partnership tag sits. */}
                  <span className="pointer-events-none absolute right-2 bottom-2 left-2 flex flex-wrap gap-1">
                    <ReelStatus reel={reel} solid />
                    {reel.review ? <ReviewBadge status={reel.review} className="bg-foreground text-background" /> : null}
                  </span>
                </div>
                <p className="mt-2 truncate text-sm font-semibold">{reel.filename}</p>
                <p className="truncate text-[12.5px] text-muted-foreground">
                  {brandView ? `${reel.sent_at ? reel.owner_name : "Your team"} · ` : ""}
                  {when(reel.sent_at ?? reel.created_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="overflow-hidden rounded-[10px] border border-border bg-card">
          {shown.map((reel) => (
            <li key={reel.id} className="border-b border-border last:border-0">
              <Link href={`/dashboard/reels/${reel.id}`} className="row-hover flex items-center gap-3 px-3 py-2 sm:gap-4 sm:px-4">
                <ReelThumb reelId={reel.id} hasPoster={reel.hasPoster} scrub className="w-9 shrink-0 rounded-[4px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{reel.filename}</span>
                  <span className="block truncate text-[12.5px] text-muted-foreground md:hidden">
                    {brandView ? `${reel.sent_at ? reel.owner_name : "Your team"} · ` : ""}
                    {when(reel.sent_at ?? reel.created_at)}
                  </span>
                </span>
                {brandView ? <span className="hidden w-36 shrink-0 truncate text-[13px] text-muted-foreground md:block">{reel.sent_at ? reel.owner_name : "Your team"}</span> : null}
                <span className="hidden w-32 shrink-0 text-right text-[13px] whitespace-nowrap text-muted-foreground tabular-nums md:block">{when(reel.sent_at ?? reel.created_at)}</span>
                <span className="flex shrink-0 flex-col items-end gap-1 sm:w-[210px] sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                  {reel.review ? <ReviewBadge status={reel.review} /> : null}
                  <ReelStatus reel={reel} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ViewButton({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={active} onClick={onClick} className={cn("grid size-7 place-items-center rounded-[4px]", active ? "bg-foreground text-background" : "text-muted-foreground")}>
      {children}
    </button>
  );
}
