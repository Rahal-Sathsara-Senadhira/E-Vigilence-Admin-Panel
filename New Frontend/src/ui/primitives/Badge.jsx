import { cn } from "../cn.js";

const TONES = {
  neutral: "bg-sunken text-text-muted",
  action: "bg-action-soft text-action",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

/**
 * A small label. Always has text — colour is never the only signal.
 * @param {{ tone?: keyof typeof TONES, children: import("react").ReactNode, className?: string }} props
 */
export function Badge({ tone = "neutral", children, className }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
