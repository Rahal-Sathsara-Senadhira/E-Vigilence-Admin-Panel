import { forwardRef } from "react";
import { cn } from "../cn.js";
import { fieldClass } from "./field-class.js";

/** @typedef {import("react").TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }} TextareaProps */

export const Textarea = forwardRef(
  /** @param {TextareaProps} props @param {import("react").Ref<HTMLTextAreaElement>} ref */
  function Textarea({ invalid, className, rows = 3, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        aria-invalid={invalid || undefined}
        className={cn(fieldClass(invalid), "h-auto py-2.5 leading-relaxed", className)}
        {...rest}
      />
    );
  },
);
