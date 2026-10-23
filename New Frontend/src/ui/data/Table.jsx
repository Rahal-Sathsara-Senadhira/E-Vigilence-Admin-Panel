// Data tables (docs/18 §6.2): full table from tablets up. On phones, lists
// render cards instead (each feature decides which fields matter most).

import { cn } from "../cn.js";

/** @param {{ children: import("react").ReactNode, label: string, className?: string }} props */
export function Table({ children, label, className }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm" aria-label={label}>
        {children}
      </table>
    </div>
  );
}

/** @param {import("react").ThHTMLAttributes<HTMLTableCellElement>} props */
export function Th({ className, ...rest }) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-border bg-sunken px-4 py-2.5 text-left text-xs font-medium whitespace-nowrap text-text-muted",
        className,
      )}
      {...rest}
    />
  );
}

/** @param {import("react").TdHTMLAttributes<HTMLTableCellElement>} props */
export function Td({ className, ...rest }) {
  return (
    <td className={cn("border-b border-border px-4 py-3 align-middle", className)} {...rest} />
  );
}

/**
 * A row that opens a record. The link inside the first cell carries the
 * keyboard focus; the rest of the row is a larger click target.
 * @param {{ children: import("react").ReactNode, onOpen?: () => void, className?: string }} props
 */
export function Tr({ children, onOpen, className }) {
  return (
    <tr
      onClick={onOpen}
      className={cn("transition-colors", onOpen && "cursor-pointer hover:bg-sunken/60", className)}
    >
      {children}
    </tr>
  );
}
