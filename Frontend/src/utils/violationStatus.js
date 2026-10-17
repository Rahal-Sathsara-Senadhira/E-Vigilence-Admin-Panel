// src/utils/violationStatus.js
//
// Single source of truth for violation status display — label + color.
// Colors come from the status tokens in index.css (st-open, st-pending, …):
// six distinct hues so statuses can be told apart at a glance. Class names
// are written out in full so Tailwind can see them.

export const STATUS_OPTIONS = [
  "open",
  "pending",
  "in_review",
  "verified",
  "resolved",
  "rejected",
];

// className — the solid status pill (text color picked for contrast on its
// fill); dot — a small solid marker; stripe — the left edge of a table row /
// card; tile — the top accent of a status tile; tileActive — a selected tile.
const STATUS_META = {
  open: {
    label: "Open",
    className: "border-st-open bg-st-open text-white",
    dot: "bg-st-open",
    stripe: "border-l-st-open",
    tile: "border-t-st-open",
    tileActive: "border-st-open bg-st-open/10 ring-st-open/30",
  },
  pending: {
    label: "Pending",
    className: "border-st-pending bg-st-pending text-amber-950",
    dot: "bg-st-pending",
    stripe: "border-l-st-pending",
    tile: "border-t-st-pending",
    tileActive: "border-st-pending bg-st-pending/10 ring-st-pending/30",
  },
  in_review: {
    label: "In Review",
    className: "border-st-review bg-st-review text-white",
    dot: "bg-st-review",
    stripe: "border-l-st-review",
    tile: "border-t-st-review",
    tileActive: "border-st-review bg-st-review/10 ring-st-review/30",
  },
  verified: {
    label: "Verified",
    className: "border-st-verified bg-st-verified text-white",
    dot: "bg-st-verified",
    stripe: "border-l-st-verified",
    tile: "border-t-st-verified",
    tileActive: "border-st-verified bg-st-verified/10 ring-st-verified/30",
  },
  resolved: {
    label: "Resolved",
    className: "border-st-resolved bg-st-resolved text-white",
    dot: "bg-st-resolved",
    stripe: "border-l-st-resolved",
    tile: "border-t-st-resolved",
    tileActive: "border-st-resolved bg-st-resolved/10 ring-st-resolved/30",
  },
  rejected: {
    label: "Rejected",
    className: "border-st-rejected bg-st-rejected text-white",
    dot: "bg-st-rejected",
    stripe: "border-l-st-rejected",
    tile: "border-t-st-rejected",
    tileActive: "border-st-rejected bg-st-rejected/10 ring-st-rejected/30",
  },
};

const FALLBACK_META = {
  label: "Unknown",
  className: "border-line bg-raised text-muted",
  dot: "bg-muted",
  stripe: "border-l-line",
  tile: "border-t-line",
  tileActive: "border-line bg-raised ring-line",
};

export function getStatusMeta(status) {
  if (status && STATUS_META[status]) return STATUS_META[status];
  return { ...FALLBACK_META, label: status || "Unknown" };
}
