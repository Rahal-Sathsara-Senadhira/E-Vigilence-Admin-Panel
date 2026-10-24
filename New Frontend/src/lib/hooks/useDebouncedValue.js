import { useEffect, useState } from "react";

/**
 * The value, once it has stopped changing for `ms` — e.g. a search box,
 * so the server is asked once per pause in typing, not once per key.
 * @template T
 * @param {T} value @param {number} [ms]
 * @returns {T}
 */
export function useDebouncedValue(value, ms = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
