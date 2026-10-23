// A panel that slides in from the side (docs/18 §6.2): action forms, and
// the full menu on phones. Full width on phones.

import * as RDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../cn.js";

/**
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   title: string,
 *   description?: string,
 *   side?: "left" | "right",
 *   hideTitle?: boolean,
 *   footer?: import("react").ReactNode,
 *   children?: import("react").ReactNode,
 * }} props
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  side = "right",
  hideTitle,
  footer,
  children,
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <RDialog.Content
          className={cn(
            "fixed inset-y-0 z-50 flex w-full flex-col bg-panel shadow-overlay focus:outline-none sm:max-w-md",
            "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
            side === "right" ? "right-0 sm:border-l" : "left-0 sm:border-r",
            "border-border",
          )}
        >
          <div
            className={cn(
              "flex items-start justify-between gap-4 px-5 py-4",
              !hideTitle && "border-b border-border",
            )}
          >
            <div className={hideTitle ? "sr-only" : undefined}>
              <RDialog.Title className="text-base font-semibold text-text">{title}</RDialog.Title>
              <RDialog.Description
                className={description ? "mt-0.5 text-sm text-text-muted" : "sr-only"}
              >
                {description ?? title}
              </RDialog.Description>
            </div>
            <RDialog.Close
              className="ml-auto grid size-9 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-sunken hover:text-text"
              aria-label="Close"
            >
              <X className="size-4" />
            </RDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
