import React from "react";
import { Search, Plus } from "lucide-react";
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
        if (!cancelled) {
          setItems(res.filter((r) => !(values ?? []).includes(r)).slice(0, 8));
          setActive(0);
        }
      } finally {
        !cancelled && setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [deb, fetcher, values]);

  // Typing something that doesn't match anything in the list (a brand-new
  // violation type, say) is still a valid entry — it isn't in the catalog
  // yet, so offer to add it as free text. The backend auto-creates a
  // catalog entry for any unrecognized name (utils/violationCatalog.js),
  // so this is how a new violation type actually enters the system.
  const trimmedQuery = query.trim();
  const alreadyCovered =
    !trimmedQuery ||
    items.some((it) => it.toLowerCase() === trimmedQuery.toLowerCase()) ||
    (values ?? []).some((v) => v.toLowerCase() === trimmedQuery.toLowerCase());
  const showAddNew = !alreadyCovered;
  const optionCount = items.length + (showAddNew ? 1 : 0);

  React.useEffect(() => {
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);

  const add = (i) => {
    let next;
    if (i < items.length) {
      next = items[i];
    } else if (showAddNew && i === items.length) {
      next = trimmedQuery;
    }
    if (!next) return;
    onChange?.([...(values ?? []), next]);
    setQuery(""); setOpen(false);
  };
  const remove = (t) => onChange?.((values ?? []).filter((v) => v !== t));

  return (
    <div className="relative" ref={rootRef}>
      {label && <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">{label}</p>}

      {/* SEARCH BAR ONLY */}
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 focus-within:border-brand-blue">
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
              setActive((a) => Math.min(a + 1, Math.max(optionCount - 1, 0)));
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
          className="h-10 flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        {loading && <div className="animate-pulse text-xs text-slate-500">loading…</div>}
      </div>

      {/* SELECTED CHIPS BELOW (OUTSIDE) */}
      <div className="mt-2 flex flex-wrap gap-2">
        {(values ?? []).map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs text-slate-800 dark:text-slate-200"
          >
            {v}
            <button
              onClick={() => remove(v)}
              className="text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
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
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 dark:border-slate-800/60 bg-white dark:bg-slate-950/95 p-1 backdrop-blur shadow-xl"
        >
          {items.length === 0 && !showAddNew ? (
            <li className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No results</li>
          ) : (
            <>
              {items.map((it, idx) => (
                <li
                  key={`${it}-${idx}`}
                  role="option"
                  aria-selected={idx === active}
                  onMouseDown={(e) => { e.preventDefault(); add(idx); }}
                  className={cx(
                    "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2",
                    idx === active
                      ? "bg-brand-blue text-white"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  <Search className="h-4 w-4 text-slate-400" />
                  <span className="text-sm">{it}</span>
                </li>
              ))}

              {showAddNew && (
                <li
                  role="option"
                  aria-selected={items.length === active}
                  onMouseDown={(e) => { e.preventDefault(); add(items.length); }}
                  className={cx(
                    "flex cursor-pointer items-center gap-2 rounded-lg border-t border-slate-200 dark:border-slate-800 px-3 py-2",
                    items.length === active
                      ? "bg-brand-blue text-white"
                      : "text-brand-blue dark:text-blue-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-sm">
                    Add <span className="font-semibold">&ldquo;{trimmedQuery}&rdquo;</span> as new
                  </span>
                </li>
              )}
            </>
          )}
        </ul>
      )}
    </div>
  );
}

