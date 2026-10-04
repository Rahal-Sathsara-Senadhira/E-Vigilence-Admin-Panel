import React from "react";
import { Link } from "react-router-dom";
import { RefreshCcw } from "lucide-react";

import { listCitations, updateCitationPaymentStatus } from "../../services/citationsApi";
import { getUser } from "../../utils/auth";
import { Card, Badge, Select, ErrorState } from "../../components/ui";

const PAYMENT_STATUSES = ["unpaid", "paid", "appealed", "waived"];
const PAYMENT_TONE = { unpaid: "amber", paid: "green", appealed: "blue", waived: "neutral" };

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString();
}

export default function Citations() {
  const isHQ = getUser()?.role === "hq";

  const [citations, setCitations] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [filter, setFilter] = React.useState("");
  const [savingId, setSavingId] = React.useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const res = await listCitations({ paymentStatus: filter });
      setCitations(Array.isArray(res) ? res : []);
    } catch (e) {
      setError(e?.message || "Failed to load citations");
      setCitations([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function onChangePaymentStatus(id, paymentStatus) {
    try {
      setSavingId(id);
      await updateCitationPaymentStatus(id, paymentStatus);
      await load();
    } catch (e) {
      setError(e?.message || "Failed to update payment status");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="grid gap-4">
      <Card
        title="Citations"
        subtitle="Issued automatically when a violation is verified — the fine amount is locked in at that time."
        action={
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        }
      >
        <Select label="Payment status" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </Select>

        {error && <div className="mt-3"><ErrorState message={error} /></div>}
      </Card>

      <Card>
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-12 gap-2 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950/40 px-3 py-2 text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-300">
            <div className="col-span-3">Citation</div>
            <div className="col-span-3">Violation</div>
            <div className="col-span-2">Fine Amount</div>
            <div className="col-span-2">Due Date</div>
            <div className="col-span-2">Payment Status</div>
          </div>

          {loading ? (
            <div className="px-3 py-6 text-sm font-medium text-slate-700 dark:text-slate-400">Loading...</div>
          ) : citations.length === 0 ? (
            <div className="px-3 py-6 text-sm font-medium text-slate-700 dark:text-slate-400">
              No citations issued yet.
            </div>
          ) : (
            citations.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-12 gap-2 border-b border-slate-200 dark:border-slate-800 px-3 py-3 items-center"
              >
                <div className="col-span-3">
                  <p className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                    {c.citationNumber}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Issued {fmtDate(c.createdAt)}</p>
                </div>

                <div className="col-span-3">
                  {c.violation ? (
                    <Link
                      to={`/violations/${c.violation._id || c.violation.id}`}
                      className="text-sm font-semibold text-brand-blue dark:text-blue-300 hover:underline"
                    >
                      {c.violation.title}
                    </Link>
                  ) : (
                    <span className="text-sm text-slate-500">—</span>
                  )}
                  {c.violation?.vehicleNumber ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{c.violation.vehicleNumber}</p>
                  ) : null}
                </div>

                <div className="col-span-2">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {c.fineAmount == null ? "—" : `Rs. ${c.fineAmount}`}
                  </p>
                </div>

                <div className="col-span-2">
                  <p className="text-sm text-slate-700 dark:text-slate-300">{fmtDate(c.dueDate)}</p>
                </div>

                <div className="col-span-2">
                  {isHQ ? (
                    <select
                      value={c.paymentStatus}
                      disabled={savingId === c.id}
                      onChange={(e) => onChangePaymentStatus(c.id, e.target.value)}
                      className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-900 dark:text-slate-100 focus:border-brand-blue focus:outline-none disabled:opacity-60"
                    >
                      {PAYMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s[0].toUpperCase() + s.slice(1)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge tone={PAYMENT_TONE[c.paymentStatus] || "neutral"}>{c.paymentStatus}</Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
