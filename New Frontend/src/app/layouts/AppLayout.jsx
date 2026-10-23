// The frame around every signed-in page — docs/18 §6:
//   phone       top bar + bottom tabs + full menu in a sheet
//   tablet+     icon rail + top bar with search
//   1440 px+    rail expanded with labels (the user can collapse it)

import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { CommandPalette } from "@/features/search/index.js";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery.js";
import { can } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";
import { homeFor, navigationFor } from "../navigation.js";
import { BottomTabs } from "./frame/BottomTabs.jsx";
import { MobileMenu } from "./frame/MobileMenu.jsx";
import { Rail } from "./frame/Rail.jsx";
import { TopBar } from "./frame/TopBar.jsx";

const RAIL_KEY = "ev-rail";

/** @returns {"expanded" | "collapsed" | null} */
function savedRail() {
  try {
    const v = localStorage.getItem(RAIL_KEY);
    return v === "expanded" || v === "collapsed" ? v : null;
  } catch {
    return null;
  }
}

export function AppLayout() {
  const user = useCurrentUser();
  const location = useLocation();
  const sections = useMemo(() => navigationFor(user), [user]);
  const wide = useMediaQuery("(min-width: 1440px)");
  const [railPref, setRailPref] = useState(savedRail);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const expanded = railPref ? railPref === "expanded" : wide;
  const toggleRail = () => {
    const next = expanded ? "collapsed" : "expanded";
    setRailPref(next);
    try {
      localStorage.setItem(RAIL_KEY, next);
    } catch {
      /* not remembered */
    }
  };

  // Ctrl+K / ⌘K opens search from anywhere.
  useEffect(() => {
    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = sections
    .flatMap((s) => s.items)
    .find((i) => location.pathname === i.to || location.pathname.startsWith(`${i.to}/`));
  const title = location.pathname === "/me" ? "My account" : (current?.label ?? "E-Vigilance");

  return (
    <div className="flex min-h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-panel px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Rail sections={sections} expanded={expanded} onToggle={toggleRail} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onSearch={() => setPaletteOpen(true)} title={title} />
        <main
          id="main"
          tabIndex={-1}
          className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] focus:outline-none sm:pb-0"
        >
          <Outlet />
        </main>
      </div>
      <BottomTabs
        home={homeFor(user)}
        canAdd={can(user, "reports.record")}
        onSearch={() => setPaletteOpen(true)}
        onMenu={() => setMenuOpen(true)}
      />
      <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} sections={sections} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} sections={sections} />
    </div>
  );
}
