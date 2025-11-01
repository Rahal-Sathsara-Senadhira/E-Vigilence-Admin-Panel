import React from "react";
import { Menu, Search, Bell } from "lucide-react";

export default function Topbar({ onMenu }) {
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur">
      <div className="flex h-full items-center gap-3 px-4">
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 lg:hidden"
          onClick={onMenu}
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="relative ml-1 hidden max-w-xl flex-1 items-center lg:flex">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-500" />
          <input
            placeholder="Search Violation"
            className="h-10 w-full rounded-xl border border-slate-800 bg-slate-900/60 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
          </button>
          <div className="hidden items-center gap-3 rounded-xl bg-slate-900/60 p-2 pr-3 lg:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800/70 text-slate-200">
              AO
            </div>
            <div>
              <p className="text-xs text-slate-400">Admin</p>
              <p className="text-sm font-medium text-slate-100">Alex Ortega</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
