import React from "react";
import { Menu, Search, Bell, Sun, Moon } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { getUser } from "../utils/auth";
import useUnreadCount from "../hooks/useUnreadCount";
import { useTheme } from "../hooks/useTheme";

export default function Topbar({ onMenu }) {
  const nav = useNavigate();
  const location = useLocation();
  const [user, setUser] = React.useState(() => getUser());

  React.useEffect(() => {
    function handleAuthUpdate() {
      setUser(getUser());
    }
    window.addEventListener("auth-updated", handleAuthUpdate);
    return () => window.removeEventListener("auth-updated", handleAuthUpdate);
  }, []);

  const unread = useUnreadCount(user?.role);
  const { theme, toggleTheme } = useTheme();
  const [q, setQ] = React.useState("");

  const initials = (user?.name || "Admin")
    .split(" ")
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase())
    .join("");

  function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i += 1) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j += 1) matrix[j][0] = j;
    for (let j = 1; j <= b.length; j += 1) {
      for (let i = 1; i <= a.length; i += 1) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    return matrix[b.length][a.length];
  }

  const ROUTES = [
    { path: "/dashboard", keywords: ["dashboard", "home", "main"] },
    { path: "/settings", keywords: ["settings", "config", "preferences"] },
    { path: "/users", keywords: ["users", "people", "staff", "admins"] },
    { path: "/reports", keywords: ["reports", "analytics", "data"] },
    { path: "/regional-stations", keywords: ["regional stations", "hq", "regions"] },
    { path: "/police-stations", keywords: ["police stations", "stations"] },
    { path: "/citations", keywords: ["citations", "fines", "tickets"] },
    { path: "/violation-catalog", keywords: ["violation catalog", "catalog", "types"] },
    { path: "/violations", keywords: ["violations", "complaints"] }
  ];

  function onSearchSubmit(e) {
    e.preventDefault();
    const term = q.trim().toLowerCase();
    
    // Default destination is Dashboard
    if (!term) {
      nav("/dashboard");
      return;
    }

    let bestMatch = null;
    let bestScore = Infinity;

    for (const route of ROUTES) {
      for (const kw of route.keywords) {
        if (kw.includes(term) || term.includes(kw)) {
          bestScore = 0;
          bestMatch = route.path;
        } else {
          const dist = levenshtein(term, kw);
          if (dist < bestScore) {
            bestScore = dist;
            bestMatch = route.path;
          }
        }
      }
    }

    // Allow up to 3 typos for a match
    if (bestMatch && bestScore <= 3) {
      nav(bestMatch);
      setQ("");
    } else {
      alert("There is no page like that! Please try another word.");
    }
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
            placeholder="Search pages (e.g. settings, users, stations)..."
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
            <img
              src={user?.avatarUrl || (user?.email === "admin@evigilance.com" || user?.email === "admin@evigilence.com" || user?.name?.includes("Nanditha") || user?.name?.includes("Hettiarachchi") ? "/avatars/dr-nanditha.png" : "/avatars/default-avatar.svg")}
              alt={user?.name || "User Avatar"}
              className="w-10 h-10 rounded-full object-cover object-top border-2 border-white/20 shadow-sm shrink-0 bg-white"
              onError={(e) => {
                e.currentTarget.src = "/avatars/default-avatar.svg";
              }}
            />
            <div>
              <p className="text-xs text-white/70">{user?.role === "hq" ? "Head Quarters" : (user?.role || "Admin")}</p>
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
