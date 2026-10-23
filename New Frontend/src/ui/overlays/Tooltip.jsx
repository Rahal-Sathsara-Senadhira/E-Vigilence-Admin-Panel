// Short labels on hover and keyboard focus (e.g. icon-only rail items).
// Never the only place important information appears.

import * as RTooltip from "@radix-ui/react-tooltip";

/** Wraps the app once. @param {{ children: import("react").ReactNode }} props */
export function TooltipProvider({ children }) {
  return (
    <RTooltip.Provider delayDuration={300} skipDelayDuration={150}>
      {children}
    </RTooltip.Provider>
  );
}

/**
 * @param {{
 *   label: import("react").ReactNode,
 *   side?: "top" | "right" | "bottom" | "left",
 *   disabled?: boolean,
 *   children: import("react").ReactElement,
 * }} props
 */
export function Tooltip({ label, side = "right", disabled, children }) {
  if (disabled) return children;
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={8}
          className="z-50 rounded-md bg-text px-2 py-1 text-xs font-medium text-panel shadow-overlay"
        >
          {label}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}
