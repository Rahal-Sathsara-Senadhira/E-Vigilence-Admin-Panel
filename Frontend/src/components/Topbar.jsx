import React from "react";
import { Menu, Search, Bell, Sun, Moon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getUser } from "../utils/auth";
import useUnreadCount from "../hooks/useUnreadCount";
import { useTheme } from "../hooks/useTheme";

export default function Topbar({ onMenu }) {
  const nav = useNavigate();
  const user = getUser();
  const unread = useUnreadCount(user?.role);
  const { theme, toggleTheme } = useTheme();
  const [q, setQ] = React.useState("");

  const initials = (user?.name || "Admin")
    .split(" ")
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase())
    .join("");

  function onSearchSubmit(e) {
    e.preventDefault();
    const term = q.trim();
    nav(term ? `/violations?q=${encodeURIComponent(term)}` : "/violations");
  }

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-slate-200 dark:border-slate-800/60 bg-white/80 dark:bg-slate-950/80 backdrop-blur transition-colors">
      <div className="flex h-full items-center gap-3 px-4">
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
          onClick={onMenu}
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <form
          onSubmit={onSearchSubmit}
          className="relative ml-1 hidden max-w-xl flex-1 items-center lg:flex"
        >
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search violations by title, plate, or description…"
            className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-brand-blue focus:outline-none"
          />
        </form>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
            aria-label="Toggle Theme"
            type="button"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          <button
            onClick={() => nav("/notifications")}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
            aria-label="Notifications"
            type="button"
          >
            <Bell className="h-5 w-5" />
            {unread > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-slate-950 bg-cyan-600 px-1 text-[10px] font-semibold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </button>

          <div className="hidden items-center gap-3 rounded-xl bg-slate-100 dark:bg-slate-900/60 p-2 pr-3 lg:flex transition-colors">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800/70 text-slate-800 dark:text-slate-200">
              {initials}
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{user?.role || "Admin"}</p>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {user?.name || "Unknown User"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
