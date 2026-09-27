// src/utils/violationStatus.js
//
// Single source of truth for violation status display — label + color.
// Colors reuse the same semantic tokens already used elsewhere in the app
// (amber = needs attention, cyan = in progress, emerald = resolved) rather
// than introducing a new palette.

export const STATUS_OPTIONS = [
  "open",
  "pending",
  "in_review",
  "resolved",
  "verified",
  "rejected",
];

const STATUS_META = {
  open: {
    label: "Open",
    className: "border-amber-700/60 bg-amber-950/40 text-amber-300",
  },
  pending: {
    label: "Pending",
    className: "border-sky-700/60 bg-sky-950/40 text-sky-300",
  },
  in_review: {
    label: "In Review",
    className: "border-cyan-700/60 bg-cyan-950/40 text-cyan-300",
  },
  resolved: {
    label: "Resolved",
    className: "border-emerald-700/60 bg-emerald-950/40 text-emerald-300",
  },
  verified: {
    label: "Verified",
    className: "border-green-700/60 bg-green-950/40 text-green-300",
  },
  rejected: {
    label: "Rejected",
    className: "border-red-700/60 bg-red-950/40 text-red-300",
  },
};

const FALLBACK_META = {
  label: "Unknown",
  className: "border-slate-700 bg-slate-950/50 text-slate-300",
};

export function getStatusMeta(status) {
  if (status && STATUS_META[status]) return STATUS_META[status];
  return { ...FALLBACK_META, label: status || "Unknown" };
}
