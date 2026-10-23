// Buttons — one primary action per area (docs/18 §7).

import { forwardRef } from "react";
import { cn } from "../cn.js";
import { Spinner } from "./Spinner.jsx";

const VARIANTS = {
  primary: "bg-action text-action-ink hover:bg-action-hover",
  secondary: "border border-border-strong bg-panel text-text hover:bg-sunken",
  ghost: "text-text hover:bg-sunken",
  danger: "bg-danger text-white hover:brightness-95",
};

const SIZES = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
};

/**
 * @typedef {import("react").ButtonHTMLAttributes<HTMLButtonElement> & {
 *   variant?: keyof typeof VARIANTS,
 *   size?: keyof typeof SIZES,
 *   loading?: boolean,
 *   icon?: import("react").ReactNode,
 *   block?: boolean,
 * }} ButtonProps
 */

export const Button = forwardRef(
  /** @param {ButtonProps} props @param {import("react").Ref<HTMLButtonElement>} ref */
  function Button(
    {
      variant = "secondary",
      size = "md",
      loading = false,
      icon,
      block,
      className,
      children,
      disabled,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "pointer-coarse:min-h-11",
          VARIANTS[variant],
          SIZES[size],
          block && "w-full",
          className,
        )}
        {...rest}
      >
        {loading ? <Spinner label="Working" /> : icon}
        {children}
      </button>
    );
  },
);
