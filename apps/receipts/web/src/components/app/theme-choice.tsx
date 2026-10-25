/**
 * Light, Dark, or follow the system, copied from Remora's components/app/theme-choice.tsx (ADR-0066).
 * `index.html` applies the stored choice before the first paint, under the same key.
 */
import { Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

export type Theme = "light" | "dark" | "system";

const KEY = "receipts.theme";
const EVENT = "receipts:theme";

/** Storage throws in a private window and in some previews; the theme then just follows the system. */
function stored(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function store(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {}
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(theme: Theme): void {
  document.documentElement.classList.toggle(
    "dark",
    theme === "dark" || (theme === "system" && systemPrefersDark()),
  );
}

export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(stored);

  useEffect(() => {
    apply(theme);
    if (theme !== "system" || typeof matchMedia !== "function") return;
    const query = matchMedia("(prefers-color-scheme: dark)");
    const update = () => apply("system");
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [theme]);

  useEffect(() => {
    const sync = () => setTheme(stored());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const choose = useCallback((next: Theme) => {
    store(next);
    setTheme(next);
    apply(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [theme, choose];
}

/** Mounted once in the shell, so the stored or system theme applies without opening the menu. */
export function ThemeSync() {
  useTheme();
  return null;
}

export function ThemeChoice() {
  const [theme, choose] = useTheme();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Sun />
        Theme
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => choose(value as Theme)}
          aria-label="Theme"
        >
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
