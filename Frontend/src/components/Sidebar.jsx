// src/components/Sidebar.jsx
import React from "react";
import {
  LayoutDashboard,
  ShieldAlert,
  ListChecks,
  MapPin,
  Users,
  Bell,
  Settings,
  LogOut,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";

// OPTIONAL: show unread badge (works when backend route exists)
import { api } from "../services/api";

// ✅ auth helpers (you should have these from my earlier message)
import { clearAuth, getUser } from "../utils/auth";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Violations", icon: ShieldAlert, to: "/violations" },
  { label: "Reports", icon: ListChecks, to: "/reports" },
  { label: "Regional Stations", icon: MapPin, to: "/regional-stations" },
  { label: "User Management", icon: Users, to: "/users" },
  { label: "Notifications", icon: Bell, to: "/notifications", badgeKey: "unread" },
  { label: "Settings", icon: Settings, to: "/settings" },
];

export default function Sidebar({ open, onClose }) {
  const nav = useNavigate();
  const user = getUser();

  const initials = (user?.name || "Admin")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  const [unread, setUnread] = React.useState(0);

  // Fetch unread count (safe)
  React.useEffect(() => {
    let mounted = true;

    async function loadUnread() {
      try {
        // Use whatever endpoint you have. If not exists, it will fail silently.
        const res = await api.get("/api/dashboard/summary");

        // support both styles:
        // A) res = { kpis: {...} }
        // B) res = { data: { kpis: {...} } }
        const kpis = res?.kpis || res?.data?.kpis || {};
        const count = kpis?.unread_notifications ?? 0;

        if (mounted) setUnread(Number(count) || 0);
      } catch {
        // ignore (keeps UI stable)
      }
    }

    loadUnread();
    const t = setInterval(loadUnread, 10000);

    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  function handleLogout() {
    clearAuth();
    nav("/login", { replace: true });
    if (onClose) onClose();
  }

  return (
    <aside
      className={[
        "fixed inset-y-0 left-0 z-40 w-72 shrink-0",
        "border-r border-slate-800/60 bg-slate-950/95 backdrop-blur",
        "transition-transform duration-300",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      ].join(" ")}
    >
      <div className="flex h-16 items-center gap-2 px-4">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-800/60">
          <div className="h-4 w-4 rounded-full bg-cyan-400" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-100">E Vigilance</p>
          <p className="text-[11px] text-slate-400">Admin Panel</p>
        </div>
        <button
          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 lg:hidden"
          onClick={onClose}
          aria-label="Close sidebar"
          type="button"
        >
          ✕
        </button>
      </div>

      <nav className="mt-2 space-y-1 px-2">
        {navItems.map(({ label, icon: Icon, to, badgeKey }) => (
          <NavLink
            key={label}
            to={to}
            className={({ isActive }) =>
              [
                "group flex items-center gap-3 rounded-xl px-3 py-2.5",
                isActive
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white",
              ].join(" ")
            }
            onClick={() => {
              // close sidebar on mobile after navigation
              if (onClose) onClose();
            }}
          >
            <Icon className="h-5 w-5 text-slate-400 group-hover:text-white" />
            <span className="text-sm font-medium">{label}</span>

            {badgeKey === "unread" && unread > 0 ? (
              <span className="ml-auto rounded-full bg-cyan-600/25 px-2 py-0.5 text-xs font-semibold text-cyan-200 border border-cyan-700/50">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>

      <div className="absolute bottom-0 left-0 right-0 border-t border-slate-800/60 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-slate-900/60 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/70 text-slate-200">
            {initials}
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">
              {user?.name || "Unknown User"}
            </p>
            <p className="text-xs text-slate-400">{user?.role || "Admin"}</p>
          </div>

          <button
            onClick={handleLogout}
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            aria-label="Logout"
            type="button"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}