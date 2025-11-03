// src/pages/violations/Violations.jsx
import React from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";

export default function Violations() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">Violations</h2>
        <Link
          to="/violations/new"
          className="inline-flex items-center gap-2 rounded-xl border border-cyan-700 bg-cyan-600/20 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-600/30"
        >
          <Plus className="h-4 w-4" />
          New Complaint
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-slate-300">
        {/* Placeholder table/list */}
        <p>No violations listed yet.</p>
      </div>
    </div>
  );
}
