// The panel's menu — docs/18 §7.1. Each item names the permission(s) that
// show it; the user's permissions come from the backend (docs/19 D19-5), so
// a role sees only what it can use. The backend refuses the rest anyway.

import {
  AlarmClock,
  BookOpenText,
  Building2,
  ChartColumn,
  FileText,
  FolderOpen,
  Gauge,
  Gavel,
  Landmark,
  Gift,
  HeartPulse,
  Inbox,
  LayoutDashboard,
  ScrollText,
  Settings2,
  Timer,
  Users,
  Wallet,
} from "lucide-react";
import { can } from "@/lib/permissions.js";

/** @typedef {import("@/lib/api.js").CurrentUser} CurrentUser */

/**
 * @typedef {object} NavItem
 * @property {string} to
 * @property {string} label
 * @property {import("lucide-react").LucideIcon} icon
 * @property {string[]} anyOf   shown when the user has any of these permissions
 * @property {string} phase     the build phase that delivers it (TODO.md)
 * @property {string} summary   one line for its page until it is built
 */

/** @param {CurrentUser} user */
function dashboardItem(user) {
  const p = user.permissions;
  const label = p["dashboard.national"]
    ? "Command centre"
    : p["dashboard.division"]
      ? "Division"
      : p["dashboard.station"]
        ? "My station"
        : "My work";
  return {
    to: "/dashboard",
    label,
    icon: p["dashboard.mine"] ? Gauge : LayoutDashboard,
    anyOf: ["dashboard.national", "dashboard.division", "dashboard.station", "dashboard.mine"],
    phase: "N9",
    summary: "Figures and queues for your role, each opening the list it counts.",
  };
}

/** @param {CurrentUser} user @returns {{ title: string, items: NavItem[] }[]} */
export function navigationFor(user) {
  /** @type {{ title: string, items: NavItem[] }[]} */
  const sections = [
    {
      title: "Work",
      items: [
        {
          to: "/inbox",
          label: "Inbox",
          icon: Inbox,
          anyOf: [
            "reports.triage",
            "cases.acceptReturn",
            "cases.decide",
            "notices.serve",
            "payments.reviewReceipt",
          ],
          phase: "N2",
          summary: "Everything waiting for you, sorted by the time left.",
        },
        dashboardItem(user),
        {
          to: "/reports",
          label: "Reports",
          icon: FileText,
          anyOf: ["reports.view"],
          phase: "N2",
          summary: "Reports from the public and officers, triage and evidence.",
        },
        {
          to: "/cases",
          label: "Cases",
          icon: FolderOpen,
          anyOf: ["cases.view"],
          phase: "N3",
          summary: "Dispatch, investigation, recommendations and decisions.",
        },
        {
          to: "/notices",
          label: "Penalty notices",
          icon: ScrollText,
          anyOf: ["notices.view"],
          phase: "N4",
          summary: "Service, named drivers, disputes and overdue notices.",
        },
        {
          to: "/court",
          label: "Court",
          icon: Gavel,
          anyOf: ["court.view"],
          phase: "N6",
          summary: "Court referrals, filings, hearings and results.",
        },
        {
          to: "/payments",
          label: "Payments",
          icon: Wallet,
          anyOf: ["payments.view"],
          phase: "N5",
          summary: "Receipts, refunds and reconciliation.",
        },
      ],
    },
    {
      title: "Oversight",
      items: [
        {
          to: "/overdue",
          label: "Overdue",
          icon: AlarmClock,
          anyOf: ["reports.view", "cases.view", "notices.view", "court.view", "payments.view"],
          phase: "N7",
          summary: "Time limits missed in your area, until each item moves on.",
        },
        {
          to: "/management-reports",
          label: "Management reports",
          icon: ChartColumn,
          anyOf: ["managementReports.view"],
          phase: "N9",
          summary: "Monthly reports and exports.",
        },
        {
          to: "/audit",
          label: "Audit log",
          icon: BookOpenText,
          anyOf: ["audit.view"],
          phase: "N1",
          summary: "Who did what and when — every change, in a tamper-evident log.",
        },
      ],
    },
    {
      title: "Administration",
      items: [
        {
          to: "/accounts",
          label: user.permissions["users.manage"] === "S" ? "Station staff" : "Accounts",
          icon: Users,
          anyOf: ["users.view"],
          phase: "N0",
          summary: "Create accounts, reset passwords and two-step sign-in, unlock and deactivate.",
        },
        {
          to: "/stations",
          label: can(user, "stations.manage")
            ? "Divisions & stations"
            : user.permissions["stations.view"] === "S"
              ? "Station profile"
              : "Stations",
          icon: Building2,
          anyOf: ["stations.manage", "stations.editContact"],
          phase: "N1",
          summary: "Divisions, stations, their areas on the map and contact details.",
        },
        {
          to: "/offences",
          label: "Offence schedule",
          icon: ScrollText,
          anyOf: ["offences.view"],
          phase: "N1",
          summary: "Offences and fines from the Gazette, with their versions.",
        },
        {
          to: "/settings/courts",
          label: "Courts",
          icon: Landmark,
          anyOf: ["stations.manage"],
          phase: "N6",
          summary: "Magistrate's Courts and each station's default court.",
        },
        {
          to: "/settings/time-limits",
          label: "Time limits",
          icon: Timer,
          anyOf: ["settings.timeLimits"],
          phase: "N1",
          summary: "How long each step may take before it is overdue.",
        },
        {
          to: "/rewards",
          label: "Rewards",
          icon: Gift,
          anyOf: ["rewards.view"],
          phase: "N8",
          summary: "Citizen rewards: points, holds for review, rules and payouts.",
        },
        {
          to: "/system",
          label: "System health",
          icon: HeartPulse,
          anyOf: ["system.health"],
          phase: "N0",
          summary: "Background jobs, mobile-app sync, storage and sign-in failures.",
        },
        {
          to: "/system/settings",
          label: "System settings",
          icon: Settings2,
          anyOf: ["settings.system"],
          phase: "N1",
          summary: "Technical settings for the whole system.",
        },
      ],
    },
  ];
  return sections
    .map((s) => ({ ...s, items: s.items.filter((i) => i.anyOf.some((p) => can(user, p))) }))
    .filter((s) => s.items.length > 0);
}

/** Every menu item the user can reach, flat. @param {CurrentUser} user */
export const navItemsFor = (user) => navigationFor(user).flatMap((s) => s.items);

/**
 * Where each role lands after signing in — docs/18 §7.1.
 * @param {CurrentUser} user
 */
export function homeFor(user) {
  const preferred = {
    system_admin: "/system",
    hq_admin: "/accounts",
    hq_operator: "/inbox",
    hq_supervisor: "/inbox",
    finance_officer: "/inbox",
    auditor: "/audit",
    executive: "/dashboard",
    division_supervisor: "/dashboard",
    station_oic: "/dashboard",
    traffic_officer: "/dashboard",
    station_clerk: "/inbox",
  }[user.role];
  const reachable = navItemsFor(user).map((i) => i.to);
  return preferred && reachable.includes(preferred) ? preferred : (reachable[0] ?? "/me");
}
