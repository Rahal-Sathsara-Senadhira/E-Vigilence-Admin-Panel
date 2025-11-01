import React from "react";

export default function Dashboard() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <p className="text-sm text-slate-400">Vehicle number</p>
        <input
          className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
          placeholder="e.g., ABC-1234"
        />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-sm text-slate-400">Caller Mobile Number</p>
            <input
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
              placeholder="+94 77 123 4567"
            />
          </div>
          <div>
            <p className="text-sm text-slate-400">Vehicle Type</p>
            <input
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
              placeholder="Car / Bike / Truck"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <p className="text-sm text-slate-400">Violations</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {["Driving Recklessly", "Wrong side Driving", "Speeding"].map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              {t}
              <button className="ml-1 rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
                ✕
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="md:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <p className="text-sm text-slate-400">Location</p>
        <div className="mt-2 h-72 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center text-sm text-slate-500">
          Map placeholder
        </div>
      </div>
    </div>
  );
}
