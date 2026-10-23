// The user menu in the top bar: who is signed in, "My account", theme, sign out.

import { ChevronDown, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { useNavigate } from "react-router";
import { useCurrentUser, useSession } from "@/lib/session-context.js";
import { useTheme } from "@/lib/theme.js";
import { Avatar, Menu, MenuItem, MenuLabel, MenuSeparator, cn } from "@/ui/index.js";

const THEMES = /** @type {const} */ ([
  ["light", "Light", Sun],
  ["dark", "Dark", Moon],
  ["system", "Same as device", Monitor],
]);

export function UserMenu() {
  const user = useCurrentUser();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const theme = useTheme();
  const place = user.station?.name ?? user.division?.name ?? "Traffic Headquarters";

  return (
    <Menu
      trigger={
        <button
          type="button"
          aria-label={`Account menu for ${user.name}`}
          className="flex items-center gap-2 rounded-lg p-1 hover:bg-sunken lg:pr-2"
        >
          <Avatar name={user.name} />
          <span className="hidden text-left leading-tight lg:block">
            <span className="block max-w-40 truncate text-sm font-medium text-text">
              {user.name}
            </span>
            <span className="block max-w-40 truncate text-xs text-text-muted">
              {user.roleLabel}
            </span>
          </span>
          <ChevronDown className="hidden size-4 text-text-muted lg:block" aria-hidden />
        </button>
      }
    >
      <MenuLabel>
        <p className="text-sm font-medium text-text">{user.name}</p>
        <p className="text-xs text-text-muted">
          {user.roleLabel} · {place}
        </p>
      </MenuLabel>
      <MenuSeparator />
      <MenuItem icon={<UserRound />} onSelect={() => navigate("/me")}>
        My account
      </MenuItem>
      <MenuSeparator />
      <p className="px-2.5 pt-1 pb-1 text-xs font-medium text-text-muted">Theme</p>
      {THEMES.map(([value, label, Icon]) => (
        <MenuItem key={value} icon={<Icon />} onSelect={() => theme.set(value)}>
          <span className="flex-1">{label}</span>
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              theme.choice === value ? "bg-action" : "bg-transparent",
            )}
          />
          {theme.choice === value ? <span className="sr-only">(selected)</span> : null}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem icon={<LogOut />} onSelect={() => void signOut()}>
        Sign out
      </MenuItem>
    </Menu>
  );
}
