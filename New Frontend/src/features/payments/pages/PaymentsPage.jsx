// Payments — receipts to review, refunds due, and every payment (docs/07).

import { Search } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { Alert, Input, Page, Panel, Select } from "@/ui/index.js";
import { usePayments } from "../api.js";
import { PaymentList } from "../components/PaymentList.jsx";

const VIEWS = [
  ["all", "All payments"],
  ["receipts_to_review", "Receipts to review"],
  ["refunds_due", "Refunds due"],
  ["refunded", "Refunded"],
  ["flagged", "Flagged"],
];

export function PaymentsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "all";
  const page = Number(params.get("page") ?? 1) || 1;
  const list = usePayments({ view, q: params.get("q") ?? undefined, page });
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
    <Page title="Payments" description="Fines paid online or at a counter, receipts and refunds.">
      <Alert tone="warning" className="mb-5" title="Test mode">
        Online payments go through the payment simulator: no real money moves until a payment
        provider is connected (docs/07 §11).
      </Alert>
      <Panel>
        <div className="grid gap-3 border-b border-border p-4 sm:flex">
          <div className="relative sm:max-w-xs sm:flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              aria-label="Search payments"
              placeholder="Notice number or reference"
              className="pl-9"
              defaultValue={params.get("q") ?? ""}
              onChange={(e) => update({ q: e.target.value || undefined })}
            />
          </div>
          <Select
            aria-label="Which payments"
            className="sm:w-60"
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
        <PaymentList
          query={list}
          onSelect={(id) => navigate(`/payments/${id}`)}
          onPage={(p) => update({ page: String(p) })}
          empty={{ title: "No payments", description: "Nothing matches these filters." }}
        />
      </Panel>
    </Page>
  );
}
