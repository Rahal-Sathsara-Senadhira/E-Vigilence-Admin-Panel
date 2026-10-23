// The full menu on phones: every section the role can use, plus account.

import { LogOut, UserRound } from "lucide-react";
import { NavLink } from "react-router";
import { useCurrentUser, useSession } from "@/lib/session-context.js";
import { Avatar, Sheet, cn } from "@/ui/index.js";

/**
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   sections: { title: string, items: import("../../navigation.js").NavItem[] }[],
 * }} props
 */
export function MobileMenu({ open, onOpenChange, sections }) {
  const user = useCurrentUser();
  const { signOut } = useSession();
  const close = () => onOpenChange(false);
  const link = ({ isActive }) =>
    cn(
      "flex min-h-12 items-center gap-3 rounded-lg px-3 text-[15px]",
      isActive ? "bg-action-soft font-medium text-action" : "text-text hover:bg-sunken",
    );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Menu" side="left" hideTitle>
      <div className="flex items-center gap-3 border-b border-border px-5 pb-4">
        <Avatar name={user.name} className="size-10 text-sm" />
        <div className="min-w-0">
          <p className="truncate font-medium text-text">{user.name}</p>
          <p className="truncate text-sm text-text-muted">
            {user.roleLabel}
            {user.station
              ? ` · ${user.station.name}`
              : user.division
                ? ` · ${user.division.name}`
                : ""}
          </p>
        </div>
      </div>
      <nav className="px-3 py-3" aria-label="All sections">
        {sections.map((section) => (
          <div key={section.title} className="mb-3">
            <p className="px-3 pt-2 pb-1 text-xs font-medium tracking-[0.06em] text-text-faint uppercase">
              {section.title}
            </p>
            {section.items.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={close} className={link}>
                <item.icon className="size-5 text-text-muted" aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="border-t border-border pt-3">
          <NavLink to="/me" onClick={close} className={link}>
            <UserRound className="size-5 text-text-muted" aria-hidden />
            My account
          </NavLink>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-[15px] text-danger hover:bg-sunken"
          >
            <LogOut className="size-5" aria-hidden />
            Sign out
          </button>
        </div>
      </nav>
    </Sheet>
  );
}
