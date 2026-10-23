// Native select, styled like the other fields — the most accessible choice
// on phones (the device's own picker) and for screen readers.

import { ChevronDown } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "../cn.js";
import { fieldClass } from "./field-class.js";

/** @typedef {import("react").SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }} SelectProps */

export const Select = forwardRef(
  /** @param {SelectProps} props @param {import("react").Ref<HTMLSelectElement>} ref */
  function Select({ invalid, className, children, ...rest }, ref) {
    return (
      <div className={cn("relative", className)}>
        <select
          ref={ref}
          aria-invalid={invalid || undefined}
          className={cn(fieldClass(invalid), "appearance-none pr-9")}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
      </div>
    );
  },
);
