import React from "react";
import { Search } from "lucide-react";
import { cx, useDebounced } from "../lib/ui";

export default function SearchMultiSelect({
  label,
  placeholder = "Type to search & press Enter…",
  values,
  onChange,
  fetcher,
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [items, setItems] = React.useState([]);
  const [active, setActive] = React.useState(0);
  const deb = useDebounced(query, 120);
  const listId = React.useId();
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await Promise.resolve(fetcher?.(deb) ?? []);
      if (!cancelled) {
        setItems(res.filter((r) => !(values ?? []).includes(r)).slice(0, 8));
        setActive(0);
      }
    })();
    return () => { cancelled = true; };
  }, [deb, fetcher, values]);

  React.useEffect(() => {
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);

  const add = (i) => {
    const next = items[i];
    if (!next) return;
    onChange?.([...(values ?? []), next]);
    setQuery(""); setOpen(false);
  };
  const remove = (t) => onChange?.((values ?? []).filter((v) => v !== t));

  return (
    <div className="relative" ref={rootRef}>
      {label && <p className="text-sm text-slate-400">{label}</p>}

      {/* SEARCH BAR ONLY */}
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3">
        <Search className="h-4 w-4 text-slate-500" />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !query && (values?.length ?? 0))
              remove(values[values.length - 1]);
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, Math.max(items.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              add(active);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          className="h-10 flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
      </div>

      {/* SELECTED CHIPS BELOW (OUTSIDE) */}
      <div className="mt-2 flex flex-wrap gap-2">
        {(values ?? []).map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1 text-xs"
          >
            {v}
            <button
              onClick={() => remove(v)}
              className="text-slate-400 hover:text-slate-200"
              aria-label={`Remove ${v}`}
            >
              ✕
            </button>
          </span>
        ))}
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
                onMouseDown={(e) => { e.preventDefault(); add(idx); }}
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
