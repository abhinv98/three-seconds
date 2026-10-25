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

/** Runs before first paint (inlined in the root layout) so a stored theme never flashes. */
export const themeBootScript = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;

export function ThemeMenu() {
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Theme: ${LABELS[choice]}`}>
          <Contrast className="size-5" strokeWidth={2} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={choice} onValueChange={(value) => applyChoice(value as ThemeChoice)}>
          {(Object.keys(LABELS) as ThemeChoice[]).map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {LABELS[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
