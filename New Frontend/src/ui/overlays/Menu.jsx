// Drop-down menus (user menu, "More" actions). Keyboard: arrows, Enter, Escape.

import * as RMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "../cn.js";

/**
 * @param {{
 *   trigger: import("react").ReactNode,
 *   children: import("react").ReactNode,
 *   align?: "start" | "end",
 *   side?: "top" | "bottom" | "right",
 *   className?: string,
 *   onOpenChange?: (open: boolean) => void,
 * }} props
 */
export function Menu({
  trigger,
  children,
  align = "end",
  side = "bottom",
  className,
  onOpenChange,
}) {
  return (
    <RMenu.Root onOpenChange={onOpenChange}>
      <RMenu.Trigger asChild>{trigger}</RMenu.Trigger>
      <RMenu.Portal>
        <RMenu.Content
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-50 min-w-56 rounded-xl border border-border bg-panel p-1.5 shadow-overlay",
            className,
          )}
        >
          {children}
        </RMenu.Content>
      </RMenu.Portal>
    </RMenu.Root>
  );
}

/**
 * @param {{
 *   onSelect?: (event: Event) => void,
 *   icon?: import("react").ReactNode,
 *   danger?: boolean,
 *   children: import("react").ReactNode,
 * }} props
 */
export function MenuItem({ onSelect, icon, danger, children }) {
  return (
    <RMenu.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none",
        "data-[highlighted]:bg-sunken pointer-coarse:py-2.5",
        danger ? "text-danger" : "text-text",
      )}
    >
      {icon ? <span className="text-text-muted [&>svg]:size-4">{icon}</span> : null}
      {children}
    </RMenu.Item>
  );
}

/** @param {{ children: import("react").ReactNode }} props */
export function MenuLabel({ children }) {
  return <RMenu.Label className="px-2.5 pt-1.5 pb-2">{children}</RMenu.Label>;
}

export function MenuSeparator() {
  return <RMenu.Separator className="my-1.5 h-px bg-border" />;
}
