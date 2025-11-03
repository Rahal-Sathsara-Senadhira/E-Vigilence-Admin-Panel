import React from "react";
import { Search } from "lucide-react";
import { cx, useDebounced } from "../lib/ui";

export default function SearchSelect({
  label,
  placeholder = "Type to search…",
  value,
  onChange,
  fetcher,
  disabled = false,
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [items, setItems] = React.useState([]);
  const [active, setActive] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const deb = useDebounced(query, 120);
  const listId = React.useId();
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await Promise.resolve(fetcher?.(deb) ?? []);
        if (!cancelled) { setItems(res.slice(0, 8)); setActive(0); }
      } finally { !cancelled && setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [deb, fetcher]);

  React.useEffect(() => {
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);

  const selectIndex = (i) => {
    const next = items[i];
    if (!next) return;
    onChange?.(next);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative" ref={rootRef}>
      {label && <p className="text-sm text-slate-400">{label}</p>}

      <div
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        className="mt-2 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3"
      >
        <Search className="h-4 w-4 text-slate-500" />
        <input
          disabled={disabled}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, Math.max(items.length - 1, 0))); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); selectIndex(active); }
            else if (e.key === "Escape") { setOpen(false); }
          }}
          // Key part: show the selected value when idle
          placeholder={value || placeholder}
          className="h-10 w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-300 focus:outline-none"
        />
        {loading && <div className="animate-pulse text-xs text-slate-500">loading…</div>}
        {(value || query) && (
          <button
            onClick={() => { onChange?.(""); setQuery(""); }}
            className="text-slate-400 hover:text-slate-200"
            aria-label="Clear"
          >
            ✕
          </button>
        )}
      </div>

      {/* Optional: explicit selected label below for clarity */}
      <div className="mt-2 text-xs text-slate-400">
        Selected: <span className="text-slate-200">{value || "—"}</span>
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-800/60 bg-slate-950/95 p-1 backdrop-blur shadow-xl"
        >
          {items.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">No results</li>
          ) : (
            items.map((it, idx) => (
              <li
                key={`${it}-${idx}`}
                role="option"
                aria-selected={idx === active}
                onMouseDown={(e) => { e.preventDefault(); selectIndex(idx); }}
                className={cx(
                  "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2",
                  idx === active
                    ? "bg-slate-800 text-white"
                    : "text-slate-200 hover:bg-slate-800"
                )}
              >
                <Search className="h-4 w-4 text-slate-400" />
                <span className="text-sm">{it}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
