import { forwardRef } from "react";
import { cn } from "../cn.js";
import { fieldClass } from "./field-class.js";

/** @typedef {import("react").InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }} InputProps */

export const Input = forwardRef(
  /** @param {InputProps} props @param {import("react").Ref<HTMLInputElement>} ref */
  function Input({ invalid, className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(fieldClass(invalid), className)}
        {...rest}
      />
    );
  },
);
