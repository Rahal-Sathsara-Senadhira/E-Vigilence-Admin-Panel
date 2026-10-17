import React from "react";
import { getStatusMeta } from "../utils/violationStatus";

// Solid pill in the status's own color — see utils/violationStatus.js.
export default function StatusBadge({ status }) {
  const meta = getStatusMeta(status);
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}
