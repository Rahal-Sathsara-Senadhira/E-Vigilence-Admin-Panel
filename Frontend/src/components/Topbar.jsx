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
    <header className="flex-shrink-0 sticky top-0 z-40 h-16 border-b border-brand-blue dark:border-slate-800 bg-brand-blue dark:bg-slate-900 backdrop-blur transition-colors">
      <div className="flex h-full items-center gap-3 px-4">
        <button
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10"
          onClick={onMenu}
          aria-label="Open sidebar"
        >
          <Menu className="h-6 w-6" />
        </button>

        <form
          onSubmit={onSearchSubmit}
          className="relative ml-1 hidden max-w-xl flex-1 items-center lg:flex"
        >
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-white/60" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search violations by title, plate, or description…"
            className="h-10 w-full rounded-xl border border-white/20 bg-white/20 pl-9 pr-3 text-sm text-white placeholder:text-white/60 focus:border-white focus:outline-none focus:bg-white/30 transition-colors"
          />
        </form>

        <div className="ml-auto flex items-center gap-6">
          <button
            onClick={toggleTheme}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10"
            aria-label="Toggle Theme"
            type="button"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          <button
            onClick={() => nav("/notifications")}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10"
            aria-label="Notifications"
            type="button"
          >
            <Bell className="h-5 w-5" />
            {unread > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-brand-blue bg-cyan-400 px-1 text-[10px] font-semibold text-brand-blue">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </button>

          <div className="hidden items-center gap-3 rounded-xl bg-white/10 p-2 pr-3 lg:flex transition-colors">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user?.name || "Avatar"}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white font-semibold">
                {initials}
              </div>
            )}
            <div>
              <p className="text-xs text-white/70">{user?.role || "Admin"}</p>
              <p className="text-sm font-medium text-white">
                {user?.name || "Unknown User"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
