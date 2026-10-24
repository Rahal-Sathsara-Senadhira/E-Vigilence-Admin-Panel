// Cases — every case the user can see, by state (docs/03).

import { Search } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { scopeOf } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";
import { Input, Page, Panel, Select } from "@/ui/index.js";
import { useCases } from "../api.js";
import { CaseList } from "../components/CaseList.jsx";

const VIEWS = [
  ["all", "All cases"],
  ["active", "Being worked at stations"],
  ["not_dispatched", "Not dispatched"],
  ["awaiting_acceptance", "Waiting for a station"],
  ["returned", "Returned to HQ"],
  ["needs_officer", "Needs an officer"],
  ["closed", "Decided or closed"],
];

export function CasesPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters = {
    view: params.get("view") ?? "all",
    q: params.get("q") ?? undefined,
    priority: params.get("priority") ?? undefined,
    page: Number(params.get("page") ?? 1) || 1,
  };
  const list = useCases(filters);
  const scope = scopeOf(user, "cases.view");
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
      title="Cases"
      description={
        user.station
          ? `Cases at ${user.station.name}.`
          : scope === "D"
            ? "Cases at your division's stations."
            : "Every case, from triage to decision."
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
              aria-label="Search cases"
              placeholder="Case number, plate or place"
              className="pl-9"
              defaultValue={filters.q}
              onChange={(e) => update({ q: e.target.value || undefined })}
            />
          </div>
          <Select
            aria-label="Which cases"
            className="sm:w-60"
            value={filters.view}
            onChange={(e) => update({ view: e.target.value })}
          >
            {VIEWS.filter(
              ([k]) =>
                scope === "N" || scope === "R" || !["not_dispatched", "returned"].includes(k),
            ).map(([k, l]) => (
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
        <CaseList
          query={list}
          showStatus
          showStation={!user.station}
          onSelect={(id) => navigate(`/cases/${id}`)}
          onPage={(p) => update({ page: String(p) })}
          empty={{ title: "No cases", description: "Nothing matches these filters." }}
        />
      </Panel>
    </Page>
  );
}
