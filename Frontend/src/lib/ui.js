import { useEffect, useState } from "react";

export function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

export function useDebounced(value, delay = 150) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
