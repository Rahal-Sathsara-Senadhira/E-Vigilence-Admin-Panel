// Phone navigation (docs/18 §6.1): Home · Search · Add (if the role records
// reports) · Menu. Large touch targets, above the home indicator.

import { House, Menu as MenuIcon, Plus, Search } from "lucide-react";
import { NavLink } from "react-router";
import { cn } from "@/ui/index.js";

const TAB =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium";

/**
 * @param {{ home: string, canAdd: boolean, onSearch: () => void, onMenu: () => void }} props
 */
export function BottomTabs({ home, canAdd, onSearch, onMenu }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-panel pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <NavLink
        to={home}
        className={({ isActive }) => cn(TAB, isActive ? "text-action" : "text-text-muted")}
      >
        <House className="size-5" aria-hidden />
        Home
      </NavLink>
      <button type="button" onClick={onSearch} className={cn(TAB, "text-text-muted")}>
        <Search className="size-5" aria-hidden />
        Search
      </button>
      {canAdd ? (
        <NavLink
          to="/reports/new"
          className={({ isActive }) => cn(TAB, isActive ? "text-action" : "text-text-muted")}
        >
          <Plus className="size-5" aria-hidden />
          Add
        </NavLink>
      ) : null}
      <button type="button" onClick={onMenu} className={cn(TAB, "text-text-muted")}>
        <MenuIcon className="size-5" aria-hidden />
        Menu
      </button>
    </nav>
  );
}
