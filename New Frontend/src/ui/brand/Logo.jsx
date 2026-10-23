// The Sri Lanka Police E-Vigilance logo, on its white tile.

import { cn } from "../cn.js";

/** @param {{ className?: string }} props */
export function Logo({ className }) {
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-xl bg-white p-1.5", className)}
    >
      <img src="/logo.svg" alt="E-Vigilance logo" className="h-full w-full object-contain" />
    </span>
  );
}
