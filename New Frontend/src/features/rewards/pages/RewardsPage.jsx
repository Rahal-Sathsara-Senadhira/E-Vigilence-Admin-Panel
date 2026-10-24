// Rewards — every citizen reward by state; held ones first for those who
// review them (docs/16 §7, §9).

import { Banknote, Scale, Search } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { can } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";
import { Button, Input, Page, Panel, Select } from "@/ui/index.js";
import { useRewards } from "../api.js";
import { RewardList } from "../components/RewardList.jsx";
import { VIEWS } from "../lib/labels.js";

export function RewardsPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? (can(user, "rewards.review") ? "held" : "all");
  const page = Number(params.get("page") ?? 1) || 1;
  const list = useRewards({ view, q: params.get("q") ?? undefined, page });
  /** @param {Record<string, string | undefined>} next */
  const update = (next) => {
    /** @type {Record<string, string | undefined>} */
    const merged = { ...Object.fromEntries(params), view, ...next };
    if (!("page" in next)) delete merged.page;
    setParams(
      /** @type {Record<string, string>} */ (
        Object.fromEntries(Object.entries(merged).filter(([, v]) => v))
      ),
      { replace: true },
    );
  };
  const held = list.data?.held ?? 0;

  return (
    <Page
      title="Rewards"
      description="Points citizens earn when their reports lead to action. Simulated: no money moves."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<Banknote className="size-4" />}
            onClick={() => navigate("/rewards/payouts")}
          >
            Payouts
          </Button>
          <Button icon={<Scale className="size-4" />} onClick={() => navigate("/rewards/rules")}>
            Rules
          </Button>
        </div>
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
              aria-label="Search rewards"
              placeholder="Report, case or plate number"
              className="pl-9"
              defaultValue={params.get("q") ?? ""}
              onChange={(e) => update({ q: e.target.value || undefined })}
            />
          </div>
          <Select
            aria-label="Which rewards"
            className="sm:w-60"
            value={view}
            onChange={(e) => update({ view: e.target.value })}
          >
            {VIEWS.map(([k, l]) => (
              <option key={k} value={k}>
                {k === "held" && held ? `${l} (${held})` : l}
              </option>
            ))}
          </Select>
        </div>
        <RewardList
          rows={list.data?.items}
          pending={list.isPending}
          error={list.error}
          paging={
            list.data
              ? {
                  page: list.data.page,
                  pageSize: list.data.pageSize,
                  total: list.data.total,
                  onPage: (p) => update({ page: String(p) }),
                }
              : undefined
          }
          empty={
            view === "held"
              ? {
                  title: "Nothing held",
                  description: "Rewards held by the fraud checks appear here for review.",
                }
              : { title: "No rewards", description: "Nothing matches these filters." }
          }
        />
      </Panel>
    </Page>
  );
}
