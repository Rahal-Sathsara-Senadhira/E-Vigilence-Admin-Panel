// The role's dashboard (docs/12 §4). Its figures arrive with the work they
// count — reports (phase 1), cases (phase 2), notices (phase 3) — and the full
// dashboards in phase 7. Until then it links to what each role can use.

import { ROLE_LABELS } from "@ev/shared";
import { Card, PageHeader } from "@ev/ui";
import {
  ArrowRight,
  Building2,
  HeartPulse,
  KeyRound,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { useAuth, useCurrentUser } from "../auth/AuthProvider";
import { DASHBOARD_TITLE } from "../layout/navigation";

interface Shortcut {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  show: boolean;
}

const DESCRIPTIONS = {
  hq: "National view of reports, cases and outcomes.",
  dev: "Technical administration and system health.",
  station_oic: "Your station's cases, decisions and officers.",
  station_officer: "Cases assigned to you, by due date.",
} as const;

export function HomePage() {
  const user = useCurrentUser();
  const { allowed } = useAuth();
  const firstName = user.name.split(" ")[0];

  const shortcuts: Shortcut[] = [
    {
      to: "/accounts",
      title: user.role === "station_oic" ? "Your officers" : "Accounts",
      description:
        user.role === "station_oic"
          ? "Add officers, reset passwords, deactivate accounts."
          : "Staff accounts, roles and station postings.",
      icon: Users,
      show: allowed("users.view"),
    },
    {
      to: "/stations",
      title: "Police stations",
      description: "Stations and their divisions.",
      icon: Building2,
      show: allowed("stations.view"),
    },
    {
      to: "/audit",
      title: "Audit log",
      description: "Every sign-in and change, in a tamper-evident chain.",
      icon: ScrollText,
      show: allowed("audit.view"),
    },
    {
      to: "/system",
      title: "System health",
      description: "Database, uptime and audit-chain status.",
      icon: HeartPulse,
      show: allowed("system.health"),
    },
    {
      to: "/account/password",
      title: "Change password",
      description: "Signs you out on every other device.",
      icon: KeyRound,
      show: true,
    },
  ];

  return (
    <>
      <PageHeader title={DASHBOARD_TITLE[user.role]} description={DESCRIPTIONS[user.role]} />

      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-col gap-1 border-l-[3px] border-accent px-6 py-5">
          <p className="text-lg font-semibold text-ink">Welcome, {firstName}</p>
          <p className="text-sm text-muted">
            Signed in as {ROLE_LABELS[user.role]}
            {user.stationName ? ` at ${user.stationName}` : ""}
            {user.mfaEnabled ? " · two-step sign-in on" : ""}.
          </p>
          <p className="mt-2 text-sm text-ink">
            Reports, cases and penalty notices will appear here as each part of the new system goes
            live.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shortcuts
          .filter((s) => s.show)
          .map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="group rounded-xl border border-line bg-surface p-5 shadow-card transition-colors outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <div className="flex items-start gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <s.icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 font-medium text-ink">
                    {s.title}
                    <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
                  </p>
                  <p className="mt-1 text-sm text-muted">{s.description}</p>
                </div>
              </div>
            </Link>
          ))}
      </div>
    </>
  );
}
