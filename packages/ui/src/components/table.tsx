// Tables — docs/13 §4: header row `raised` with 12 px uppercase muted labels,
// rows separated by `line`, hover `raised`. Scrolls sideways on small screens
// instead of breaking the layout.

import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./primitives";

/**
 * `fixed`: columns take the widths set on the header cells, so several
 * tables stacked on one page line up.
 */
export function Table({
  children,
  className,
  fixed = false,
}: {
  children: ReactNode;
  className?: string;
  fixed?: boolean;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table
        className={cn(
          "w-full border-collapse text-left text-sm",
          fixed && "min-w-[720px] table-fixed",
        )}
      >
        {children}
      </table>
    </div>
  );
}

export function Th({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-line bg-raised px-4 py-2.5 text-xs font-semibold tracking-wide whitespace-nowrap text-muted uppercase",
        className,
      )}
      {...rest}
    />
  );
}

export function Td({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("border-b border-line px-4 py-3 align-middle text-ink", className)}
      {...rest}
    />
  );
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("transition-colors hover:bg-raised/60", className)}>{children}</tr>;
}
