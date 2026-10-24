// Court — every court case the user can see, by stage (docs/06).

import { Search } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { Input, Page, Panel, Select } from "@/ui/index.js";
import { useCourtCases } from "../api.js";
import { CourtList } from "../components/CourtList.jsx";

const VIEWS = [
  ["all", "All court cases"],
  ["to_prepare", "To prepare"],
  ["to_approve", "Waiting for approval"],
  ["to_file", "Approved — to file"],
  ["hearings", "At hearing"],
  ["verdicts_to_confirm", "Verdicts to confirm"],
  ["flagged", "Many postponements"],
  ["closed", "Closed or withdrawn"],
];

export function CourtPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "all";
  const page = Number(params.get("page") ?? 1) || 1;
  const list = useCourtCases({ view, q: params.get("q") ?? undefined, page });
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
    <Page title="Court" description="Court referrals, filings, hearings and verdicts.">
      <Panel>
        <div className="grid gap-3 border-b border-border p-4 sm:flex">
          <div className="relative sm:max-w-xs sm:flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              aria-label="Search court cases"
              placeholder="CR, case, court or notice number"
              className="pl-9"
              defaultValue={params.get("q") ?? ""}
              onChange={(e) => update({ q: e.target.value || undefined })}
            />
          </div>
          <Select
            aria-label="Which court cases"
            className="sm:w-64"
            value={view}
            onChange={(e) => update({ view: e.target.value })}
          >
            {VIEWS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <CourtList
          query={list}
          onSelect={(id) => navigate(`/court/${id}`)}
          onPage={(p) => update({ page: String(p) })}
          empty={{ title: "No court cases", description: "Nothing matches these filters." }}
        />
      </Panel>
    </Page>
  );
}
