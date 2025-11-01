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

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/" },
  { label: "Violations", icon: ShieldAlert, to: "/violations" },
  { label: "Reports", icon: ListChecks, to: "/reports" },
  { label: "Regional Stations", icon: MapPin, to: "/stations" },
  { label: "User Management", icon: Users, to: "/users" },
  { label: "Notifications", icon: Bell, to: "/notifications" },
  { label: "Settings", icon: Settings, to: "/settings" },
];

export default function Sidebar({ open, onClose }) {
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
        >
          ✕
        </button>
      </div>

      <div className="px-4 pb-3">
        <p className="px-3 text-[11px] uppercase tracking-wide text-slate-500">
          Traffic enforcement intelligence
        </p>
        <p className="px-3 text-[11px] text-slate-600">in one command center</p>
      </div>

      <nav className="mt-2 space-y-1 px-2">
        {navItems.map(({ label, icon: Icon, to }) => (
          <a
            key={label}
            href={to}
            className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <Icon className="h-5 w-5 text-slate-400 group-hover:text-white" />
            <span className="text-sm font-medium">{label}</span>
          </a>
        ))}
      </nav>

      <div className="absolute bottom-0 left-0 right-0 border-t border-slate-800/60 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-slate-900/60 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/70 text-slate-200">
            AO
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">
              Alex Ortega
            </p>
            <p className="text-xs text-slate-400">Admin</p>
          </div>
          <button
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            aria-label="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
