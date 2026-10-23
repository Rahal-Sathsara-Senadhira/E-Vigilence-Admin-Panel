// Theme: follow the device, or a saved choice (docs/13 §9 — both themes are
// first-class). The choice is a per-browser convenience; if storage is
// unavailable the page simply follows the device.

import { useCallback, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "ev-theme";

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeChoice>(read);
  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next);
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* storage blocked — the choice lasts for this page only */
    }
  }, []);
  return { theme, setTheme };
}
