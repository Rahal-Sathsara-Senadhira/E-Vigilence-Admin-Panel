import { useSyncExternalStore } from "react";

/**
 * True while the media query matches, e.g. useMediaQuery("(min-width: 1440px)").
 * @param {string} query
 */
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
