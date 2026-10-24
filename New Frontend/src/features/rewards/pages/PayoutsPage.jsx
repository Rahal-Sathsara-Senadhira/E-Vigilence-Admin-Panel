// Payouts — requests waiting for the weekly batch, the batches, and totals
// by month for finance (docs/16 §6, §9). Simulated: no money moves.

import { ArrowLeft, Banknote, Layers } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { formatDateTime } from "@/lib/format.js";
import { can } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Page,
  Pagination,
  Panel,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
  cn,
} from "@/ui/index.js";
import { useBatches, usePayoutAction, usePayouts, useRewardTotals } from "../api.js";
import { PayoutList } from "../components/PayoutList.jsx";
import { BATCH_STATUS, rupees } from "../lib/labels.js";

const TABS = /** @type {const} */ ([
  ["requests", "Requests"],
  ["batches", "Batches"],
  ["totals", "Totals"],
]);
const VIEWS = [
  ["requested", "Waiting for a batch"],
  ["batched", "In a batch"],
  ["failed", "Failed"],
  ["paid", "Paid"],
  ["rejected", "Rejected"],
  ["all", "All payouts"],
];

export function PayoutsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "requests";
  return (
    <Page
      title="Payouts"
      description="Citizens' payout requests, paid in weekly batches. Simulated: no money moves."
      back={
        <Link
          to="/rewards"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden /> Rewards
        </Link>
      }
    >
      <div className="mb-4 flex gap-1" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams(key === "requests" ? {} : { tab: key }, { replace: true })}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm",
              tab === key
                ? "bg-action-soft font-medium text-action"
                : "text-text-muted hover:bg-sunken",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "batches" ? <Batches /> : tab === "totals" ? <Totals /> : <Requests />}
    </Page>
  );
}

function Requests() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "requested";
  const page = Number(params.get("page") ?? 1) || 1;
  const list = usePayouts({ view, page });
  const prepare = usePayoutAction();
  const canPay = can(user, "rewards.approvePayouts");
  const waiting = list.data?.waiting;

  return (
    <div className="grid gap-4">
      {waiting?.count ? (
        <Alert
          tone="info"
          title={`${waiting.count} request${waiting.count === 1 ? "" : "s"} waiting · ${rupees(waiting.amount)}`}
        >
          {canPay ? (
            <span className="mt-2 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                icon={<Layers className="size-4" />}
                loading={prepare.isPending}
                onClick={async () => {
                  const b = await prepare.mutateAsync({ path: "/rewards/batches" });
                  navigate(`/rewards/batches/${b.id}`);
                }}
              >
                Prepare this week&apos;s batch
              </Button>
              <span className="text-xs">
                Another finance officer approves it before anything is paid.
              </span>
            </span>
          ) : (
            "Finance prepares and approves the weekly batch."
          )}
        </Alert>
      ) : null}
      {prepare.isError ? <Alert tone="danger">{prepare.error.message}</Alert> : null}
      <Panel>
        <div className="border-b border-border p-4">
          <Select
            aria-label="Which payouts"
            className="sm:w-64"
            value={view}
            onChange={(e) => setParams({ view: e.target.value }, { replace: true })}
          >
            {VIEWS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        {list.isPending ? (
          <Skeleton className="m-4 h-40" />
        ) : list.isError ? (
          <p className="p-4 text-sm text-danger">{list.error.message}</p>
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={<Banknote />}
            title="No payouts here"
            description="Citizens ask for payouts in the app once they have enough confirmed points."
          />
        ) : (
          <>
            <PayoutList rows={list.data.items} canPay={canPay} />
            <Pagination
              page={list.data.page}
              pageSize={list.data.pageSize}
              total={list.data.total}
              noun="payouts"
              onPage={(p) => setParams({ view, page: String(p) })}
            />
          </>
        )}
      </Panel>
    </div>
  );
}

function Batches() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1) || 1;
  const list = useBatches(page);
  if (list.isPending) return <Skeleton className="h-40" />;
  if (list.isError) return <Alert tone="danger">{list.error.message}</Alert>;
  return (
    <Panel>
      {list.data.items.length === 0 ? (
        <EmptyState
          icon={<Layers />}
          title="No batches yet"
          description="Prepared batches appear here."
        />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {list.data.items.map((b) => {
              const [label, tone] = BATCH_STATUS[b.status];
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/rewards/batches/${b.id}`)}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-sunken sm:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[13px] font-medium text-text">
                        {b.number}
                      </span>
                      <span className="block text-xs text-text-muted">
                        {b.count} payouts · prepared by {b.preparedBy},{" "}
                        {formatDateTime(b.preparedAt)}
                        {b.approvedBy ? ` · approved by ${b.approvedBy}` : ""}
                      </span>
                    </span>
                    <Badge tone={/** @type {any} */ (tone)}>{label}</Badge>
                    <span className="w-28 text-right text-sm font-semibold tabular-nums text-text">
                      {rupees(b.amount)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            noun="batches"
            onPage={(p) => setParams({ tab: "batches", page: String(p) })}
          />
        </>
      )}
    </Panel>
  );
}

function Totals() {
  const totals = useRewardTotals();
  if (totals.isPending) return <Skeleton className="h-40" />;
  if (totals.isError) return <Alert tone="danger">{totals.error.message}</Alert>;
  const month = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <Panel
      title="By month"
      description="Points earned, confirmed, reversed and paid out; Sri Lanka time."
    >
      {totals.data.months.length === 0 ? (
        <p className="p-5 text-sm text-text-muted">No rewards in the last six months.</p>
      ) : (
        <Table label="Reward totals by month">
          <thead>
            <tr>
              <Th>Month</Th>
              <Th className="text-right">Earned</Th>
              <Th className="text-right">Confirmed</Th>
              <Th className="text-right">Reversed</Th>
              <Th className="text-right">Paid out (points)</Th>
              <Th className="text-right">Paid out</Th>
              <Th className="text-right">Payouts</Th>
            </tr>
          </thead>
          <tbody>
            {totals.data.months.map((m) => (
              <Tr key={m.month}>
                <Td className="whitespace-nowrap">
                  {month.format(new Date(`${m.month}-01T00:00:00Z`))}
                </Td>
                <Td className="text-right tabular-nums">{m.earned.toLocaleString("en-LK")}</Td>
                <Td className="text-right tabular-nums">{m.confirmed.toLocaleString("en-LK")}</Td>
                <Td className="text-right tabular-nums">{m.reversed.toLocaleString("en-LK")}</Td>
                <Td className="text-right tabular-nums">{m.paidPoints.toLocaleString("en-LK")}</Td>
                <Td className="text-right whitespace-nowrap tabular-nums">
                  {rupees(m.paidAmount)}
                </Td>
                <Td className="text-right tabular-nums">{m.payouts}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}
