import React from "react";

export default function Placeholder({ title }) {
  return (
    <div className="rounded-2xl border border-slate-400 dark:border-slate-700 bg-slate-300 dark:bg-slate-800 p-6">
      <h2 className="text-xl font-bold text-slate-100 mb-2">{title}</h2>
      <p className="text-slate-400">This feature is currently under development.</p>
    </div>
  );
}


