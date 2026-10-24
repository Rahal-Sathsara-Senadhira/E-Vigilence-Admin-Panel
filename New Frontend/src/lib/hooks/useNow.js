import { useSyncExternalStore } from "react";

// The current time, shared: one timer for every clock on screen, ticking
// every 30 seconds while anything is listening (deadline clocks, docs/09).

const TICK_MS = 30_000;
let now = Date.now();
/** @type {Set<() => void>} */
const listeners = new Set();
/** @type {ReturnType<typeof setInterval> | null} */
let timer = null;

/** @param {() => void} listener */
function subscribe(listener) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Milliseconds since 1970, refreshed every 30 seconds. */
export function useNow() {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => now,
  );
}
