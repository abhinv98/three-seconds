"use client";

import { useSyncExternalStore } from "react";
import { Contrast } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "ts-theme";
const CHANGE_EVENT = "ts-theme-change";
const LABELS: Record<ThemeChoice, string> = { system: "System", light: "Paper", dark: "Ink" };

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** "system" removes data-theme so tokens.css follows prefers-color-scheme. */
function applyChoice(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    if (choice === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Private mode: the choice lasts for this page view only.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// On the landing page it also decides, before first paint, whether the intro plays (components/landing/intro.tsx):
// "first" until the visitor has named Tickle, "back" afterwards, never for a returning visitor who prefers reduced
// motion. ?intro replays it from the start and ?intro=0 leaves it out (for demo links and screenshots). If the page
// never hydrates, the intro lifts itself after 9 seconds.
// Tickle keeps office hours (lib/ist.ts, whereIsTickle): at work 09:00 to 18:00 IST on weekdays, otherwise at home in
// the cave. data-tickle is set before paint so he is never seen leaving on load; ?tickle=work|home overrides it. The
// intro, where he introduces himself, plays only while he is at work.
const introBoot = `if(location.pathname==="/"){var d=document.documentElement,s=location.search,f=s.match(/[?&]tickle=(work|home)(&|$)/),w=new Date(Date.now()+198e5),h=w.getUTCHours(),k=f?f[1]==="work":w.getUTCDay()%6!==0&&h>=9&&h<18;d.setAttribute("data-tickle",k?"work":"home");var c=localStorage.getItem("lp-tickle"),q=s.match(/[?&]intro(=[^&]*)?(&|$)/),m=!k?"":q?(q[1]==="=0"?"":"first"):!c?"first":matchMedia("(prefers-reduced-motion: reduce)").matches?"":"back";if(m){d.setAttribute("data-intro",m);setTimeout(function(){if(!window.__lpIntro)d.removeAttribute("data-intro")},9000)}}`;

/** Runs before first paint (inlined in the root layout) so a stored theme never flashes. */
// It also marks <html> with "js" so pages can hide content for an entrance only when a script can reveal it.
export const themeBootScript = `(function(){document.documentElement.classList.add("js");try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}try{${introBoot}}catch(e){}})();`;

/** `systemLabel` names what no choice means on this page; the landing page follows the visitor's local time. */
export function ThemeMenu({ systemLabel = LABELS.system }: { systemLabel?: string }) {
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);
  const labels: Record<ThemeChoice, string> = { ...LABELS, system: systemLabel };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Theme: ${labels[choice]}`}>
          <Contrast className="size-5" strokeWidth={2} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={choice} onValueChange={(value) => applyChoice(value as ThemeChoice)}>
          {(Object.keys(labels) as ThemeChoice[]).map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {labels[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
