// Centred dialog for confirmations (docs/18 §7). Forms use Sheet instead.
// Built on Radix: focus is trapped, Escape closes, the page behind is inert.

import * as RDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../cn.js";

/**
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   title: string,
 *   description?: import("react").ReactNode,
 *   footer?: import("react").ReactNode,
 *   children?: import("react").ReactNode,
 *   size?: "sm" | "md",
 * }} props
 */
export function Dialog({ open, onOpenChange, title, description, footer, children, size = "sm" }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <RDialog.Content
          className={cn(
            "fixed z-50 flex max-h-[85dvh] flex-col border border-border bg-panel shadow-overlay focus:outline-none",
            // Phone: a sheet from the bottom. Larger: centred.
            "inset-x-0 bottom-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]",
            "sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-0",
            size === "sm" ? "sm:max-w-md" : "sm:max-w-xl",
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-6">
            <div>
              <RDialog.Title className="text-base font-semibold text-text">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-1 text-sm text-text-muted">
                  {description}
                </RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">{title}</RDialog.Description>
              )}
            </div>
            <RDialog.Close
              className="-mt-1 -mr-2 grid size-8 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-sunken hover:text-text"
              aria-label="Close"
            >
              <X className="size-4" />
            </RDialog.Close>
          </div>
          {children ? <div className="min-h-0 overflow-y-auto px-6 pt-4">{children}</div> : null}
          {footer ? (
            <div className="flex flex-col-reverse gap-2 px-6 pt-6 pb-6 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : (
            <div className="pb-6" />
          )}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
