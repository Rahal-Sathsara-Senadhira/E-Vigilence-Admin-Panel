// The navy rail (docs/18 §5, §6.1): icons with tooltips on tablets and
// laptops; expanded with labels on wide screens or when pinned.

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NavLink } from "react-router";
import { Logo, Tooltip, cn } from "@/ui/index.js";

/**
 * @param {{
 *   sections: { title: string, items: import("../../navigation.js").NavItem[] }[],
 *   expanded: boolean,
 *   onToggle: () => void,
 * }} props
 */
export function Rail({ sections, expanded, onToggle }) {
  return (
    <aside
      aria-label="Main menu"
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col bg-rail text-rail-ink sm:flex",
        "transition-[width] duration-200",
        expanded ? "w-60" : "w-16",
      )}
    >
      <div className={cn("flex h-14 items-center gap-3", expanded ? "px-4" : "justify-center")}>
        <Logo className="h-9 w-[52px] shrink-0 rounded-lg p-1" />
        {expanded ? (
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-semibold">E-Vigilance</p>
            <p className="truncate text-[11px] text-rail-muted">Sri Lanka Police</p>
          </div>
        ) : null}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section, i) => (
          <div key={section.title} className={i > 0 ? "mt-4" : undefined}>
            {expanded ? (
              <p className="px-3 pb-1.5 text-[11px] font-medium tracking-[0.08em] text-rail-muted uppercase">
                {section.title}
              </p>
            ) : i > 0 ? (
              <div className="mx-3 mb-3 h-px bg-white/10" aria-hidden />
            ) : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  {/* The span takes the tooltip's props, so they can't clash
                      with NavLink's className function. */}
                  <Tooltip label={item.label} disabled={expanded}>
                    <span className="block">
                      <NavLink
                        to={item.to}
                        aria-label={expanded ? undefined : item.label}
                        className={({ isActive }) =>
                          cn(
                            "relative flex h-10 items-center gap-3 rounded-lg text-sm transition-colors",
                            expanded ? "px-3" : "justify-center",
                            isActive
                              ? "bg-white/12 font-medium text-rail-ink"
                              : "text-rail-muted hover:bg-white/6 hover:text-rail-ink",
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive ? (
                              <span
                                aria-hidden
                                className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-attention"
                              />
                            ) : null}
                            <item.icon className="size-[18px] shrink-0" aria-hidden />
                            {expanded ? <span className="truncate">{item.label}</span> : null}
                          </>
                        )}
                      </NavLink>
                    </span>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-2">
        <Tooltip label={expanded ? "Collapse menu" : "Expand menu"} disabled={expanded}>
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? "Collapse menu" : "Expand menu"}
            aria-expanded={expanded}
            className={cn(
              "flex h-10 w-full items-center gap-3 rounded-lg text-sm text-rail-muted hover:bg-white/6 hover:text-rail-ink",
              expanded ? "px-3" : "justify-center",
            )}
          >
            {expanded ? (
              <PanelLeftClose className="size-[18px]" aria-hidden />
            ) : (
              <PanelLeftOpen className="size-[18px]" aria-hidden />
            )}
            {expanded ? <span>Collapse</span> : null}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
