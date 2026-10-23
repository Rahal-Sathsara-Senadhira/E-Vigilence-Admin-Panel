// Inline messages. Colour is never the only signal: each tone has an icon.

import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "../cn.js";

const TONES = {
  info: { box: "border-action/30 bg-action-soft", icon: Info, iconClass: "text-action" },
  success: {
    box: "border-success/30 bg-success-soft",
    icon: CircleCheck,
    iconClass: "text-success",
  },
  warning: {
    box: "border-warning/30 bg-warning-soft",
    icon: TriangleAlert,
    iconClass: "text-warning",
  },
  danger: { box: "border-danger/30 bg-danger-soft", icon: CircleAlert, iconClass: "text-danger" },
};

/**
 * @param {{ tone?: keyof typeof TONES, title?: string, children?: import("react").ReactNode, className?: string }} props
 */
export function Alert({ tone = "info", title, children, className }) {
  const t = TONES[tone];
  const Icon = t.icon;
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border px-3.5 py-3 text-sm text-text", t.box, className)}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", t.iconClass)} aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5 text-text-muted" : ""}>{children}</div> : null}
      </div>
    </div>
  );
}
