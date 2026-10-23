// Light, dark or follow the device (docs/18 §5). Remembered on this device
// only; index.html applies it before the first paint. One shared store, so
// every control showing the choice agrees.

import { useSyncExternalStore } from "react";

const KEY = "ev-theme";

/** @typedef {"light" | "dark" | "system"} ThemeChoice */

/** @returns {ThemeChoice} */
function read() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

let current = read();
const listeners = new Set();

/** @param {ThemeChoice} choice */
function setTheme(choice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* not remembered, but applied for this visit */
  }
  current = choice;
  for (const listener of listeners) listener();
}

/** @param {() => void} listener */
function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  const choice = useSyncExternalStore(subscribe, () => current);
  return { choice, set: setTheme };
}
