import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../primitives/Button.jsx";

/**
 * "1–25 of 132" with previous and next.
 * @param {{ page: number, pageSize: number, total: number, onPage: (page: number) => void, noun?: string }} props
 */
export function Pagination({ page, pageSize, total, onPage, noun = "items" }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-text-muted">
      <span className="tabular-nums">
        {total === 0 ? `No ${noun}` : `${from}–${to} of ${total} ${noun}`}
      </span>
      {pages > 1 ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            icon={<ChevronLeft className="size-4" />}
            aria-label="Previous page"
          />
          <Button
            size="sm"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
            icon={<ChevronRight className="size-4" />}
            aria-label="Next page"
          />
        </div>
      ) : null}
    </div>
  );
}
