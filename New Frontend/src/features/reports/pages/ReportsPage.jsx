// Reports — every report the user can see, by state (docs/02).

import { Plus, Search } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { can } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";
import { Button, Input, Page, Panel, Select } from "@/ui/index.js";
import { useReports } from "../api.js";
import { ReportList } from "../components/ReportList.jsx";

const VIEWS = [
  ["all", "All reports"],
  ["triage", "Waiting for triage"],
  ["needs_info", "Asked the reporter"],
  ["second_officer", "Needs a second officer"],
  ["accepted", "Accepted or merged"],
  ["rejected", "Rejected"],
];

export function ReportsPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters = {
    view: params.get("view") ?? "all",
    q: params.get("q") ?? undefined,
    priority: params.get("priority") ?? undefined,
    page: Number(params.get("page") ?? 1) || 1,
  };
  const list = useReports(filters);
  /** @param {Record<string, string | undefined>} next */
  const update = (next) => {
    const merged = { ...Object.fromEntries(params), ...next };
    if (!("page" in next)) delete merged.page;
    setParams(
      /** @type {Record<string, string>} */ (
        Object.fromEntries(Object.entries(merged).filter(([, v]) => v))
      ),
      { replace: true },
    );
  };

  return (
    <Page
      title="Reports"
      description={
        user.station
          ? `Reports at ${user.station.name}.`
          : "Reports from the public, the mobile app and officers."
      }
      actions={
        can(user, "reports.record") ? (
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            onClick={() => navigate("/reports/new")}
          >
            New report
          </Button>
        ) : null
      }
    >
      <Panel>
        <div className="grid gap-3 border-b border-border p-4 sm:flex">
          <div className="relative sm:max-w-xs sm:flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              aria-label="Search reports"
              placeholder="Report number, plate or place"
              className="pl-9"
              defaultValue={filters.q}
              onChange={(e) => update({ q: e.target.value || undefined })}
            />
          </div>
          <Select
            aria-label="Which reports"
            className="sm:w-56"
            value={filters.view}
            onChange={(e) => update({ view: e.target.value })}
          >
            {VIEWS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Priority"
            className="sm:w-40"
            value={filters.priority ?? ""}
            onChange={(e) => update({ priority: e.target.value || undefined })}
          >
            <option value="">Any priority</option>
            <option value="P1">P1 urgent</option>
            <option value="P2">P2</option>
            <option value="P3">P3 low</option>
          </Select>
        </div>
        <ReportList
          query={list}
          showStatus
          onSelect={(id) => navigate(`/reports/${id}`)}
          onPage={(p) => update({ page: String(p) })}
          empty={{ title: "No reports", description: "Nothing matches these filters." }}
        />
      </Panel>
    </Page>
  );
}
