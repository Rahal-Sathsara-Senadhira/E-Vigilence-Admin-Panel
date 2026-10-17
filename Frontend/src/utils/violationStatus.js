// src/utils/violationStatus.js
//
// Single source of truth for violation status display — label + color.
// Colors come from the status tokens in index.css (st-open, st-pending, …),
// which have separate light and dark values, so every class below works in
// both themes. Class names are written out in full so Tailwind can see them.

export const STATUS_OPTIONS = [
  "open",
  "pending",
  "in_review",
  "verified",
  "resolved",
  "rejected",
];

// className — the status pill; dot — a small solid marker; stripe — the
// left edge of a table row / card.
const STATUS_META = {
  open: {
    label: "Open",
    className: "border-st-open/30 bg-st-open/10 text-st-open",
    dot: "bg-st-open",
    stripe: "border-l-st-open",
  },
  pending: {
    label: "Pending",
    className: "border-st-pending/30 bg-st-pending/10 text-st-pending",
    dot: "bg-st-pending",
    stripe: "border-l-st-pending",
  },
  in_review: {
    label: "In Review",
    className: "border-st-review/30 bg-st-review/10 text-st-review",
    dot: "bg-st-review",
    stripe: "border-l-st-review",
  },
  verified: {
    label: "Verified",
    className: "border-st-verified/30 bg-st-verified/10 text-st-verified",
    dot: "bg-st-verified",
    stripe: "border-l-st-verified",
  },
  resolved: {
    label: "Resolved",
    className: "border-st-resolved/30 bg-st-resolved/10 text-st-resolved",
    dot: "bg-st-resolved",
    stripe: "border-l-st-resolved",
  },
  rejected: {
    label: "Rejected",
    className: "border-st-rejected/30 bg-st-rejected/10 text-st-rejected",
    dot: "bg-st-rejected",
    stripe: "border-l-st-rejected",
  },
};

const FALLBACK_META = {
  label: "Unknown",
  className: "border-line bg-raised text-muted",
  dot: "bg-muted",
  stripe: "border-l-line",
};

export function getStatusMeta(status) {
  if (status && STATUS_META[status]) return STATUS_META[status];
  return { ...FALLBACK_META, label: status || "Unknown" };
}
