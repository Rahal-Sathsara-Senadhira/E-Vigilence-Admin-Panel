import { cn } from "../cn.js";

/** Shared look of text fields (inputs, selects, text areas). @param {boolean} [invalid] */
export const fieldClass = (invalid) =>
  cn(
    "block w-full rounded-lg border bg-panel px-3 text-sm text-text placeholder:text-text-faint",
    "h-10 pointer-coarse:h-11 transition-[border-color,box-shadow]",
    "focus:border-action focus:shadow-focus focus:outline-none",
    "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-text-muted",
    invalid ? "border-danger" : "border-border-strong",
  );
