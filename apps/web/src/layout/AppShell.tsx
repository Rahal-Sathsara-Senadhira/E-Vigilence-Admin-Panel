// Layout — docs/13 §4: navy sidebar (selected item: frame-active background,
// white text, 3 px accent bar), white top bar with a bottom border, canvas page
// with content up to 1280 px. The sidebar becomes a drawer on small screens.

import { ROLE_LABELS } from "@ev/shared";
import { DropdownMenu, MenuItem, MenuLabel, MenuSeparator, cn } from "@ev/ui";
import {
  ChevronDown,
  KeyRound,
  LogOut,
  Menu as MenuIcon,
  Monitor,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useAuth, useCurrentUser } from "../auth/AuthProvider";
import { useTheme, type ThemeChoice } from "../lib/theme";
import { ErrorBoundary } from "./ErrorBoundary";
import { navigationFor } from "./navigation";

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 lg:block">
        <Sidebar />
      </aside>

      {drawerOpen ? (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-[#07182a]/50"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative h-full w-72 max-w-[85vw]">
            <Sidebar onClose={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenNav={() => setDrawerOpen(true)} />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const { allowed } = useAuth();
  const user = useCurrentUser();
  const sections = navigationFor(user.role)
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.permission || allowed(i.permission)) }))
    .filter((s) => s.items.length > 0);

  return (
    <nav className="flex h-full flex-col bg-frame text-frame-muted">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <span className="grid size-9 place-items-center rounded-lg bg-white p-1">
          <img src="/logo.svg" alt="" className="size-full object-contain" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-[15px] font-semibold text-white">E-Vigilance</p>
          <p className="truncate text-xs text-frame-muted">Sri Lanka Police</p>
        </div>
        {onClose ? (
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="ml-auto rounded-md p-1.5 text-frame-muted hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        ) : null}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {sections.map((section, i) => (
          <div key={section.title ?? i}>
            {section.title ? (
              <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-frame-muted/70 uppercase">
                {section.title}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/"}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                        isActive
                          ? "bg-frame-active text-frame-ink"
                          : "hover:bg-white/5 hover:text-white",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? (
                          <span
                            aria-hidden
                            className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-accent"
                          />
                        ) : null}
                        <item.icon className="size-[18px] shrink-0" aria-hidden />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 px-5 py-4 text-xs text-frame-muted/80">
        {user.stationName ?? "National"} · {ROLE_LABELS[user.role]}
      </div>
    </nav>
  );
}

const THEME_OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Match device", icon: Monitor },
];

function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const { logout } = useAuth();
  const user = useCurrentUser();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const ThemeIcon = THEME_OPTIONS.find((o) => o.value === theme)?.icon ?? Monitor;
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
      <button
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="-ml-1 rounded-lg p-2 text-ink hover:bg-raised lg:hidden"
      >
        <MenuIcon className="size-5" />
      </button>
      <p className="truncate text-sm text-muted">
        <span className="font-medium text-ink">{user.stationName ?? "Police Headquarters"}</span>
        <span className="hidden sm:inline"> · Traffic enforcement</span>
      </p>

      <div className="ml-auto flex items-center gap-1">
        <DropdownMenu
          trigger={
            <button
              aria-label="Theme"
              className="rounded-lg p-2 text-muted hover:bg-raised hover:text-ink"
            >
              <ThemeIcon className="size-5" />
            </button>
          }
        >
          <MenuLabel>Theme</MenuLabel>
          {THEME_OPTIONS.map((o) => (
            <MenuItem key={o.value} icon={<o.icon />} onSelect={() => setTheme(o.value)}>
              <span className="flex-1">{o.label}</span>
              {theme === o.value ? <span className="text-xs text-primary">Selected</span> : null}
            </MenuItem>
          ))}
        </DropdownMenu>

        <DropdownMenu
          trigger={
            <button className="flex items-center gap-2.5 rounded-lg py-1.5 pr-2 pl-1.5 hover:bg-raised">
              <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-ink">
                {initials}
              </span>
              <span className="hidden text-left leading-tight md:block">
                <span className="block text-sm font-medium text-ink">{user.name}</span>
                <span className="block text-xs text-muted">{ROLE_LABELS[user.role]}</span>
              </span>
              <ChevronDown className="hidden size-4 text-muted md:block" />
            </button>
          }
        >
          <MenuLabel>
            <span className="block font-medium text-ink">{user.name}</span>
            {user.email}
          </MenuLabel>
          <MenuSeparator />
          <MenuItem icon={<KeyRound />} onSelect={() => navigate("/account/password")}>
            Change password
          </MenuItem>
          <MenuItem icon={<LogOut />} onSelect={() => void logout()}>
            Sign out
          </MenuItem>
        </DropdownMenu>
      </div>
    </header>
  );
}
