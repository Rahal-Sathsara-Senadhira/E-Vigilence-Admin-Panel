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
  Inbox,
  ClipboardList,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";

import { clearAuth, getUser } from "../utils/auth";
import { isStationRole } from "../utils/roles";
import useUnreadCount from "../hooks/useUnreadCount";

// Admin menu
const adminNavItems = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Violations", icon: ShieldAlert, to: "/violations" },
  { label: "Reports", icon: ListChecks, to: "/reports" },
  { label: "Regional Stations", icon: MapPin, to: "/regional-stations" },
  { label: "User Management", icon: Users, to: "/users" },
  { label: "Notifications", icon: Bell, to: "/notifications", badgeKey: "unread" },
  { label: "Settings", icon: Settings, to: "/settings" },
];

// Station menu
const stationNavItems = [
  { label: "Station Inbox", icon: Inbox, to: "/station/inbox" },
  { label: "Assigned Violations", icon: ClipboardList, to: "/station/assigned" },
];

export default function Sidebar({ open, onClose }) {
  const nav = useNavigate();
  const user = getUser();

  const initials = (user?.name || "User")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  const unread = useUnreadCount(user?.role);

  function handleLogout() {
    clearAuth();
    nav("/login", { replace: true });
    if (onClose) onClose();
  }

  const navItems = isStationRole(user?.role) ? stationNavItems : adminNavItems;

  return (
    <aside
      className={[
        "z-40 h-full flex-shrink-0 overflow-hidden",
        "border-r border-slate-200 dark:border-slate-800 bg-orange-50 dark:bg-slate-900 backdrop-blur",
        "transition-all duration-300 ease-in-out",
        "absolute lg:static inset-y-0 left-0",
        open ? "w-72 translate-x-0" : "w-72 -translate-x-full lg:w-0 lg:translate-x-0 lg:border-r-0",
      ].join(" ")}
    >
      <div className="flex h-16 items-center gap-3 px-4">
        <img src="/logo.png" alt="E-Vigilance Logo" className="h-10 w-auto object-contain" />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">E-Vigilance</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {isStationRole(user?.role) ? "Station Portal" : "Admin Panel"}
          </p>
        </div>
        <button
          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200 lg:hidden"
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
                "group flex items-center gap-4 rounded-xl px-6 py-3.5 transition-colors",
                isActive
                  ? "bg-slate-700 text-white"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`h-5 w-5 transition-colors ${isActive ? "text-white" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-white"}`} />
                <span className="text-base font-medium">{label}</span>

                {badgeKey === "unread" && unread > 0 ? (
                  <span className="ml-auto rounded-full bg-brand-orange px-2 py-0.5 text-xs font-semibold text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="absolute bottom-20 left-0 opacity-10 pointer-events-none">
        <svg width="120" height="120" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="0,100 0,0 100,100" fill="#2171B5" />
          <polygon points="50,100 100,50 100,100" fill="#F27D22" />
        </svg>
      </div>

      <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 dark:border-slate-800/60 p-3 bg-white dark:bg-slate-950/95">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3 transition-colors">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user?.name || "Avatar"}
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800/70 text-slate-900 dark:text-slate-200">
              {initials}
            </div>
          )}

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {user?.name || "Unknown User"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{user?.role || "user"}</p>
          </div>

          <button
            onClick={handleLogout}
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-brand-orange dark:hover:text-slate-100 transition-colors"
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