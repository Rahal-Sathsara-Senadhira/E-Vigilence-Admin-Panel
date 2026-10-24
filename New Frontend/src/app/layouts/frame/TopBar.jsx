// The top bar: search (Ctrl+K) on tablets and up, the page's place on
// phones, then read-only badge, place, notifications and the user menu.

import { Eye, MapPin, Search } from "lucide-react";
import { NotificationBell } from "@/features/notifications/index.js";
import { useCurrentUser } from "@/lib/session-context.js";
import { Badge, Logo } from "@/ui/index.js";
import { UserMenu } from "./UserMenu.jsx";

/** @param {{ onSearch: () => void, title: string }} props */
export function TopBar({ onSearch, title }) {
  const user = useCurrentUser();
  const place = user.station?.name ?? user.division?.name ?? null;
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-panel/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-panel/80">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        {/* Phone: logo and where you are. */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:hidden">
          <Logo className="h-8 w-12 shrink-0 rounded-lg p-1" />
          <p className="truncate text-[15px] font-semibold text-text">{title}</p>
        </div>

        {/* Tablet and up: search. */}
        <button
          type="button"
          onClick={onSearch}
          className="hidden h-9 w-full max-w-md items-center gap-2.5 rounded-lg border border-border bg-sunken px-3 text-sm text-text-muted hover:border-border-strong sm:flex"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">Search or jump to…</span>
          <kbd className="rounded border border-border bg-panel px-1.5 font-sans text-[11px] text-text-faint">
            {mac ? "⌘" : "Ctrl"} K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {user.readOnly ? (
            <Badge tone="warning">
              <Eye className="size-3.5" aria-hidden /> Read-only
            </Badge>
          ) : null}
          {place ? (
            <span className="hidden items-center gap-1.5 text-sm text-text-muted md:flex">
              <MapPin className="size-4" aria-hidden />
              {place}
            </span>
          ) : null}
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
