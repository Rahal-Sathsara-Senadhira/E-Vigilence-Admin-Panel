// Sidebar items, shown only to roles that have the permission (docs/01 §6).
// The API enforces the same matrix; hiding is only for convenience.

import type { Permission, StaffRole } from "@ev/shared";
import {
  BookOpenText,
  Building2,
  FileText,
  FolderOpen,
  Gauge,
  HeartPulse,
  Inbox,
  LayoutDashboard,
  Mail,
  ScrollText,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

/** Dashboard name per role — docs/12 §4. */
export const DASHBOARD_TITLE: Record<StaffRole, string> = {
  hq: "Command Center",
  dev: "Command Center",
  station_oic: "My Station",
  station_officer: "My Work",
};

export function navigationFor(role: StaffRole): NavSection[] {
  return [
    {
      items: [
        {
          to: "/",
          label: DASHBOARD_TITLE[role],
          icon: role === "station_officer" ? Gauge : LayoutDashboard,
        },
      ],
    },
    {
      title: "Work",
      items: [
        // HQ triages every report; stations see the reports they recorded (docs/02 §5, §7).
        ...(role === "hq"
          ? [{ to: "/triage", label: "Triage", icon: Inbox, permission: "reports.triage" as const }]
          : [
              {
                to: "/reports",
                label: "Reports",
                icon: Inbox,
                permission: "reports.view" as const,
              },
            ]),
        { to: "/cases", label: "Cases", icon: FolderOpen, permission: "cases.view" },
        { to: "/notices", label: "Penalty notices", icon: FileText, permission: "notices.view" },
        {
          to: "/offences",
          label: "Offence schedule",
          icon: BookOpenText,
          permission: "offences.view",
        },
      ],
    },
    {
      title: "Administration",
      items: [
        {
          to: "/accounts",
          label: role === "station_oic" ? "Your officers" : "Accounts",
          icon: Users,
          permission: "users.view",
        },
        { to: "/stations", label: "Police stations", icon: Building2, permission: "stations.view" },
        { to: "/outbox", label: "Outbox", icon: Mail, permission: "notices.withdraw" },
        { to: "/audit", label: "Audit log", icon: ScrollText, permission: "audit.view" },
        { to: "/settings/time-limits", label: "Time limits", icon: Timer },
        { to: "/system", label: "System health", icon: HeartPulse, permission: "system.health" },
      ],
    },
  ];
}
