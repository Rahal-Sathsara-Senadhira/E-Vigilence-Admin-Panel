// Inbox — everything waiting for me (docs/18 §7): report queues (triage)
// and case queues (dispatch, acceptance, officers, my cases). Notices and
// payments join with their phases.
// Laptop and up: list and record side by side. Phone and tablet: the list,
// then the record on its own page.

import { useNavigate, useSearchParams } from "react-router";
import { CaseList, CaseRecord, useCases } from "@/features/cases/index.js";
import { CourtList, CourtRecord, useCourtCases } from "@/features/court/index.js";
import { NoticeList, NoticeRecord, useNotices } from "@/features/notices/index.js";
import { PaymentList, PaymentRecord, usePayments } from "@/features/payments/index.js";
import { ReportList, ReportRecord, useReports } from "@/features/reports/index.js";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery.js";
import { can, scopeOf } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";
import { Page, Panel, cn } from "@/ui/index.js";

/** @typedef {{ kind: "reports" | "cases" | "notices" | "payments" | "court", view: string, label: string, empty: { title: string, description: string } }} Queue */

/** The queues this user works on, most pressing first. @param {import("@/lib/api.js").CurrentUser} user */
function queuesFor(user) {
  /** @type {Queue[]} */
  const queues = [];
  /** @param {Queue["kind"]} kind @param {string} view @param {string} label @param {string} title @param {string} description */
  const add = (kind, view, label, title, description) =>
    queues.push({ kind, view, label, empty: { title, description } });

  if (scopeOf(user, "reports.triage") === "N") {
    add(
      "reports",
      "triage",
      "Triage",
      "Nothing to triage",
      "New reports appear here, urgent ones first.",
    );
  }
  if (scopeOf(user, "cases.dispatch") === "N") {
    add(
      "cases",
      "not_dispatched",
      "Not dispatched",
      "Every case has a station",
      "Cases with no station found automatically appear here.",
    );
    add(
      "cases",
      "returned",
      "Returned",
      "No returned cases",
      "Cases a station sent back appear here.",
    );
  }
  if (scopeOf(user, "reports.triage") === "N") {
    add(
      "reports",
      "station_review",
      "Station reports",
      "Nothing to review",
      "Reports recorded at stations appear here for HQ review.",
    );
    add(
      "reports",
      "needs_info",
      "Asked reporters",
      "No open questions",
      "Reports waiting for the reporter's answer appear here.",
    );
  }
  if (scopeOf(user, "cases.acceptReturn") === "S") {
    add(
      "cases",
      "to_accept",
      "To accept",
      "Nothing to accept",
      "Cases HQ sends to your station appear here.",
    );
  }
  if (["S", "D"].includes(scopeOf(user, "cases.assignOfficer") ?? "")) {
    add(
      "cases",
      "needs_officer",
      "Needs an officer",
      "Every case has an officer",
      "Cases with no active investigating officer appear here.",
    );
  }
  if (can(user, "cases.decide")) {
    add(
      "cases",
      "to_decide",
      "To decide",
      "Nothing to decide",
      "Recommendations waiting for your decision appear here.",
    );
  }
  if (can(user, "cases.investigate")) {
    add(
      "cases",
      "mine",
      "My cases",
      "No cases of yours",
      "Cases you are investigating appear here.",
    );
  }
  if (can(user, "reports.record") && scopeOf(user, "reports.record") === "S") {
    add(
      "reports",
      "second_officer",
      "Officer reports",
      "Nothing to confirm",
      "Officers' own observations appear here for another officer or the OIC to confirm.",
    );
  }
  if (can(user, "notices.serve")) {
    add(
      "notices",
      "to_post",
      "Notices to post",
      "Nothing to post",
      "Notices and warning letters to print and post appear here.",
    );
    add(
      "notices",
      "service_failed",
      "Service failed",
      "No returned mail",
      "Notices that couldn't be delivered appear here for a new address.",
    );
  }
  if (can(user, "notices.reviewNomination")) {
    add(
      "notices",
      "nominations",
      "Named drivers",
      "No named drivers",
      "Drivers named by owners appear here for you to check.",
    );
  }
  if (can(user, "notices.reviewDispute")) {
    add(
      "notices",
      "disputes",
      "Disputes",
      "No disputes",
      "Disputed notices appear here for review within 7 days.",
    );
  }
  if (can(user, "court.confirmReferral")) {
    add(
      "notices",
      "court_proposed",
      "Court proposals",
      "Nothing to confirm",
      "Overdue notices proposed for court appear here for you to confirm.",
    );
  }
  if (can(user, "court.record")) {
    add(
      "court",
      "to_prepare",
      "Court: to prepare",
      "Nothing to prepare",
      "Court referrals appear here to prepare for filing.",
    );
    add(
      "court",
      "hearings",
      "Court: hearings",
      "No hearings",
      "Filed court cases appear here to record hearings and verdicts.",
    );
  }
  if (can(user, "court.confirmReferral")) {
    add(
      "court",
      "to_approve",
      "Court: approve filing",
      "Nothing to approve",
      "Prepared court cases appear here for your approval.",
    );
    add(
      "court",
      "verdicts_to_confirm",
      "Court: verdicts",
      "No verdicts to confirm",
      "Recorded verdicts appear here for you to confirm.",
    );
  }
  if (can(user, "payments.reviewReceipt")) {
    add(
      "payments",
      "receipts_to_review",
      "Receipts to review",
      "No receipts to review",
      "Receipts recorded at stations appear here for review (S3).",
    );
  }
  if (can(user, "payments.approveRefund")) {
    add(
      "payments",
      "refunds_due",
      "Refunds due",
      "No refunds due",
      "Payments for withdrawn notices appear here for approval.",
    );
  }
  if (scopeOf(user, "cases.dispatch") === "D") {
    add(
      "cases",
      "awaiting_acceptance",
      "Waiting for stations",
      "Nothing waiting",
      "Cases dispatched in your division and not yet accepted appear here.",
    );
  }
  return queues;
}

export function InboxPage() {
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const queues = queuesFor(user);
  const queue = queues.find((q) => `${q.kind}:${q.view}` === params.get("queue")) ?? queues[0];

  if (!queue) {
    return (
      <Page
        title="Inbox"
        description="Work waiting for you appears here as more of the system is built."
      />
    );
  }

  return (
    <Page
      title="Inbox"
      description="Work waiting for you, most urgent first."
      className="max-w-[1600px]"
    >
      <div
        role="tablist"
        aria-label="Queues"
        className="mb-4 flex gap-1 overflow-x-auto border-b border-border"
      >
        {queues.map((q) => {
          const key = `${q.kind}:${q.view}`;
          const selected = q === queue;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={selected}
              onClick={() => setParams({ queue: key }, { replace: true })}
              className={cn(
                "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap",
                selected
                  ? "border-action text-action"
                  : "border-transparent text-text-muted hover:text-text",
              )}
            >
              {q.label}
            </button>
          );
        })}
      </div>
      {queue.kind === "reports" ? (
        <ReportQueue key={queue.view} queue={queue} />
      ) : queue.kind === "notices" ? (
        <NoticeQueue key={queue.view} queue={queue} />
      ) : queue.kind === "payments" ? (
        <PaymentQueue key={queue.view} queue={queue} />
      ) : queue.kind === "court" ? (
        <CourtQueue key={queue.view} queue={queue} />
      ) : (
        <CaseQueue key={queue.view} queue={queue} />
      )}
    </Page>
  );
}

/**
 * List and record side by side; the selection and page live in the URL.
 * @param {{ queue: Queue, list: import("react").ReactNode, record: import("react").ReactNode, footer?: string, total: number | undefined }} props
 */
function Split({ queue, list, record, footer, total }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
      <Panel className="h-fit overflow-hidden">
        <p className="border-b border-border px-4 py-2 text-xs text-text-muted">
          {queue.label}
          {total !== undefined ? ` · ${total}` : ""}
        </p>
        {list}
        {footer ? (
          <p className="hidden border-t border-border px-4 py-2 text-xs text-text-muted lg:block">
            {footer}
          </p>
        ) : null}
      </Panel>
      {record}
    </div>
  );
}

/** URL state shared by both kinds of queue. */
function useQueueState() {
  const navigate = useNavigate();
  const wide = useMediaQuery("(min-width: 1024px)");
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1) || 1;
  const selected = params.get("item");
  /** @param {Record<string, string | null>} next */
  const update = (next) => {
    const merged = { ...Object.fromEntries(params), ...next };
    setParams(
      /** @type {Record<string, string>} */ (
        Object.fromEntries(Object.entries(merged).filter(([, v]) => v))
      ),
      { replace: true },
    );
  };
  return { navigate, wide, page, selected, update };
}

/** @param {{ when: boolean, children: import("react").ReactNode }} props */
function RecordSide({ when, children }) {
  return (
    <div className="min-w-0">
      {when ? (
        children
      ) : (
        <div className="grid h-64 place-items-center rounded-xl border border-dashed border-border text-sm text-text-muted">
          Choose an item on the left.
        </div>
      )}
    </div>
  );
}

/** @param {{ queue: Queue }} props */
function ReportQueue({ queue }) {
  const user = useCurrentUser();
  const { navigate, wide, page, selected, update } = useQueueState();
  const list = useReports({ view: queue.view, page });
  return (
    <Split
      queue={queue}
      total={list.data?.total}
      footer="Opening a report reserves it for you for 15 minutes."
      list={
        <ReportList
          query={list}
          selectedId={wide ? selected : null}
          onSelect={(id) => (wide ? update({ item: id }) : navigate(`/reports/${id}`))}
          onPage={(p) => update({ page: String(p), item: null })}
          empty={queue.empty}
        />
      }
      record={
        wide ? (
          <RecordSide when={Boolean(selected)}>
            <ReportRecord
              key={selected}
              id={/** @type {string} */ (selected)}
              canUpload={can(user, "reports.record")}
            />
          </RecordSide>
        ) : null
      }
    />
  );
}

/** @param {{ queue: Queue }} props */
function CaseQueue({ queue }) {
  const user = useCurrentUser();
  const { navigate, wide, page, selected, update } = useQueueState();
  const list = useCases({ view: queue.view, page });
  return (
    <Split
      queue={queue}
      total={list.data?.total}
      list={
        <CaseList
          query={list}
          selectedId={wide ? selected : null}
          showStation={!user.station}
          onSelect={(id) => (wide ? update({ item: id }) : navigate(`/cases/${id}`))}
          onPage={(p) => update({ page: String(p), item: null })}
          empty={queue.empty}
        />
      }
      record={
        wide ? (
          <RecordSide when={Boolean(selected)}>
            <CaseRecord
              key={selected}
              id={/** @type {string} */ (selected)}
              onGone={() => update({ item: null })}
            />
          </RecordSide>
        ) : null
      }
    />
  );
}

/** @param {{ queue: Queue }} props */
function NoticeQueue({ queue }) {
  const { navigate, wide, page, selected, update } = useQueueState();
  const list = useNotices({ view: queue.view, page });
  return (
    <Split
      queue={queue}
      total={list.data?.total}
      list={
        <NoticeList
          query={list}
          selectedId={wide ? selected : null}
          onSelect={(id) => (wide ? update({ item: id }) : navigate(`/notices/${id}`))}
          onPage={(p) => update({ page: String(p), item: null })}
          empty={queue.empty}
        />
      }
      record={
        wide ? (
          <RecordSide when={Boolean(selected)}>
            <NoticeRecord key={selected} id={/** @type {string} */ (selected)} />
          </RecordSide>
        ) : null
      }
    />
  );
}

/** @param {{ queue: Queue }} props */
function PaymentQueue({ queue }) {
  const { navigate, wide, page, selected, update } = useQueueState();
  const list = usePayments({ view: queue.view, page });
  return (
    <Split
      queue={queue}
      total={list.data?.total}
      list={
        <PaymentList
          query={list}
          selectedId={wide ? selected : null}
          onSelect={(id) => (wide ? update({ item: id }) : navigate(`/payments/${id}`))}
          onPage={(p) => update({ page: String(p), item: null })}
          empty={queue.empty}
        />
      }
      record={
        wide ? (
          <RecordSide when={Boolean(selected)}>
            <PaymentRecord key={selected} id={/** @type {string} */ (selected)} />
          </RecordSide>
        ) : null
      }
    />
  );
}

/** @param {{ queue: Queue }} props */
function CourtQueue({ queue }) {
  const { navigate, wide, page, selected, update } = useQueueState();
  const list = useCourtCases({ view: queue.view, page });
  return (
    <Split
      queue={queue}
      total={list.data?.total}
      list={
        <CourtList
          query={list}
          selectedId={wide ? selected : null}
          onSelect={(id) => (wide ? update({ item: id }) : navigate(`/court/${id}`))}
          onPage={(p) => update({ page: String(p), item: null })}
          empty={queue.empty}
        />
      }
      record={
        wide ? (
          <RecordSide when={Boolean(selected)}>
            <CourtRecord key={selected} id={/** @type {string} */ (selected)} />
          </RecordSide>
        ) : null
      }
    />
  );
}
