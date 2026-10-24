// Ctrl+K — docs/18 §7. Find a report by its number, plate or place; jump
// to any section the user can open; or run an account action. Case and
// notice numbers join here as those records are built (N3–N4).

import { Command } from "cmdk";
import * as RDialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { FileText, KeyRound, LogOut, Monitor, Moon, Search, Sun, UserRound } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue.js";
import { can } from "@/lib/permissions.js";
import { useCurrentUser, useSession } from "@/lib/session-context.js";
import { useTheme } from "@/lib/theme.js";
import { STATUS_LABELS, searchReports } from "@/features/reports/index.js";

/** Searches start at this many characters. */
const MIN_SEARCH = 3;

const ITEM =
  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-text data-[selected=true]:bg-sunken";
const GROUP =
  "px-2 pb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-text-faint";

/**
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   sections: { title: string, items: { to: string, label: string, icon: import("lucide-react").LucideIcon }[] }[],
 * }} props
 */
export function CommandPalette({ open, onOpenChange, sections }) {
  const navigate = useNavigate();
  const { signOut } = useSession();
  const theme = useTheme();
  const user = useCurrentUser();
  const [search, setSearch] = useState("");
  const term = useDebouncedValue(search.trim(), 250);
  const reports = useQuery({
    queryKey: ["reports", "search", term],
    queryFn: () => searchReports(term),
    enabled: open && can(user, "reports.view") && term.length >= MIN_SEARCH,
    staleTime: 30_000,
  });

  /** @param {boolean} next */
  const setOpen = (next) => {
    if (!next) setSearch("");
    onOpenChange(next);
  };
  /** @param {() => void} action */
  const run = (action) => {
    setOpen(false);
    action();
  };
  const found = term.length >= MIN_SEARCH ? (reports.data?.items ?? []) : [];

  return (
    <RDialog.Root open={open} onOpenChange={setOpen}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <RDialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-panel pt-[env(safe-area-inset-top)] focus:outline-none sm:inset-auto sm:top-[12vh] sm:left-1/2 sm:max-h-[min(560px,76vh)] sm:w-[calc(100%-2rem)] sm:max-w-xl sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:border-border sm:shadow-overlay"
        >
          <RDialog.Title className="sr-only">Search or jump to</RDialog.Title>
          <Command label="Search or jump to" className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-text-muted" aria-hidden />
              <Command.Input
                autoFocus
                value={search}
                onValueChange={setSearch}
                placeholder="Report number, plate, or a section…"
                className="h-14 w-full bg-transparent text-[15px] text-text outline-none placeholder:text-text-faint"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-action sm:hidden"
              >
                Cancel
              </button>
            </div>
            <Command.List className="min-h-0 flex-1 overflow-y-auto py-1">
              {reports.isFetching && !found.length ? (
                <Command.Loading>
                  <p className="px-5 py-3 text-sm text-text-muted">Searching reports…</p>
                </Command.Loading>
              ) : null}
              <Command.Empty className="px-5 py-8 text-center text-sm text-text-muted">
                {term.length >= MIN_SEARCH && reports.isFetching
                  ? "Searching…"
                  : "Nothing matches. Type a report number (e.g. RP-2026-000123), a plate or a place."}
              </Command.Empty>
              {found.length ? (
                <Command.Group heading="Reports" className={GROUP}>
                  {found.map((r) => (
                    <Command.Item
                      key={r.id}
                      // Matched by the server; the search term keeps it visible here.
                      value={`report ${r.reportNumber} ${r.vehicleNumber ?? ""} ${term}`}
                      onSelect={() => run(() => navigate(`/reports/${r.id}`))}
                      className={ITEM}
                    >
                      <FileText className="size-4 text-text-muted" aria-hidden />
                      <span className="font-mono">{r.reportNumber}</span>
                      <span className="truncate text-text-muted">
                        {r.plateUnknown ? "Plate unknown" : r.vehicleNumber}
                        {r.address ? ` · ${r.address}` : ""}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-text-muted">
                        {STATUS_LABELS[/** @type {keyof typeof STATUS_LABELS} */ (r.status)] ??
                          r.status}
                      </span>
                    </Command.Item>
                  ))}
                  {reports.data && reports.data.total > found.length ? (
                    <Command.Item
                      value={`all reports matching ${term}`}
                      onSelect={() => run(() => navigate(`/reports?q=${encodeURIComponent(term)}`))}
                      className={ITEM}
                    >
                      <Search className="size-4 text-text-muted" aria-hidden />
                      All {reports.data.total} reports matching “{term}”
                    </Command.Item>
                  ) : null}
                </Command.Group>
              ) : null}
              {sections.map((section) => (
                <Command.Group key={section.title} heading={section.title} className={GROUP}>
                  {section.items.map((item) => (
                    <Command.Item
                      key={item.to}
                      value={`${item.label} ${section.title}`}
                      onSelect={() => run(() => navigate(item.to))}
                      className={ITEM}
                    >
                      <item.icon className="size-4 text-text-muted" aria-hidden />
                      {item.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
              <Command.Group heading="Account" className={GROUP}>
                <Command.Item
                  value="My account profile"
                  onSelect={() => run(() => navigate("/me"))}
                  className={ITEM}
                >
                  <UserRound className="size-4 text-text-muted" aria-hidden />
                  My account
                </Command.Item>
                <Command.Item
                  value="Change password"
                  onSelect={() => run(() => navigate("/me#password"))}
                  className={ITEM}
                >
                  <KeyRound className="size-4 text-text-muted" aria-hidden />
                  Change password
                </Command.Item>
                <Command.Item
                  value="Theme light"
                  onSelect={() => run(() => theme.set("light"))}
                  className={ITEM}
                >
                  <Sun className="size-4 text-text-muted" aria-hidden />
                  Light theme
                </Command.Item>
                <Command.Item
                  value="Theme dark"
                  onSelect={() => run(() => theme.set("dark"))}
                  className={ITEM}
                >
                  <Moon className="size-4 text-text-muted" aria-hidden />
                  Dark theme
                </Command.Item>
                <Command.Item
                  value="Theme same as device system"
                  onSelect={() => run(() => theme.set("system"))}
                  className={ITEM}
                >
                  <Monitor className="size-4 text-text-muted" aria-hidden />
                  Theme same as device
                </Command.Item>
                <Command.Item
                  value="Sign out log out"
                  onSelect={() => run(() => void signOut())}
                  className={ITEM}
                >
                  <LogOut className="size-4 text-text-muted" aria-hidden />
                  Sign out
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
