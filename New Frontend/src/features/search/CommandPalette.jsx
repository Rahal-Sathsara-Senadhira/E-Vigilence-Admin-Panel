// Ctrl+K — docs/18 §7. Jump to any section the user can open, or run an
// account action. Searching by plate, report, case or notice number joins
// here as those records are built (N2–N4).

import { Command } from "cmdk";
import * as RDialog from "@radix-ui/react-dialog";
import { KeyRound, LogOut, Monitor, Moon, Search, Sun, UserRound } from "lucide-react";
import { useNavigate } from "react-router";
import { useSession } from "@/lib/session-context.js";
import { useTheme } from "@/lib/theme.js";

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

  /** @param {() => void} action */
  const run = (action) => {
    onOpenChange(false);
    action();
  };

  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
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
                placeholder="Search or jump to…"
                className="h-14 w-full bg-transparent text-[15px] text-text outline-none placeholder:text-text-faint"
              />
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="text-sm text-action sm:hidden"
              >
                Cancel
              </button>
            </div>
            <Command.List className="min-h-0 flex-1 overflow-y-auto py-1">
              <Command.Empty className="px-5 py-8 text-center text-sm text-text-muted">
                Nothing matches. Record search (plates, report, case and notice numbers) comes with
                those sections.
              </Command.Empty>
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
