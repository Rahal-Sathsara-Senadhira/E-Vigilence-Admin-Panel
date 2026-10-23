// Penalty notices — docs/05 §5–6.
//
// Issue (on a penalty-notice decision) → post (deemed served after 3 days,
// due 14 days later) → pay / name the driver / dispute / go overdue →
// reminder (7 more days) → court referral proposed, OIC confirms.

import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import {
  DISPUTE_GROUNDS,
  PAYABLE_STATUSES,
  caseMachine,
  mask,
  noticeMachine,
  normalizeNic,
  type DisputeGround,
  type NoticeDetail,
  type NoticeListItem,
  type NoticeStatus,
  type PublicNoticeView,
  type TimeLimitKey,
} from "@ev/shared";
import { Types, type ClientSession, type Connection, type Model, type QueryFilter } from "mongoose";
import {
  requireUser,
  systemContext,
  type ActionContext,
  type AuthenticatedUser,
} from "../../common/context";
import { nextNumber } from "../../common/counters";
import { badRequest, conflict, forbidden, notFound } from "../../common/errors";
import { inTransaction } from "../../common/transaction";
import { AuditService } from "../audit/audit.service";
import { Case, type CaseDocument } from "../cases/case.schema";
import { OffencesService } from "../offences/offences.service";
import { Person } from "../people/people.schema";
import { TimeLimitsService } from "../settings/time-limits.service";
import { StationsService } from "../stations/stations.service";
import { PenaltyNotice, type PenaltyNoticeDocument } from "./notice.schema";
import { OutboxService, letterDate } from "./outbox.service";

/** A rejected dispute gives the addressee this many more days (05 §6.3). */
const DISPUTE_REJECTED_EXTRA_DAYS = 7;
const DAY_MS = 86_400_000;
const SWEEP_MS = 15 * 60_000;

export type NoticeView =
  "all" | "to_post" | "nominations" | "disputes" | "overdue" | "court_proposed" | "service_failed";

type Lean = PenaltyNotice & { _id: Types.ObjectId };

@Injectable()
export class NoticesService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NoticesService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectModel(PenaltyNotice.name) private readonly notices: Model<PenaltyNotice>,
    @InjectModel(Case.name) private readonly cases: Model<Case>,
    @InjectModel(Person.name) private readonly persons: Model<Person>,
    @InjectConnection() private readonly conn: Connection,
    private readonly offences: OffencesService,
    private readonly limits: TimeLimitsService,
    private readonly outbox: OutboxService,
    private readonly stations: StationsService,
    private readonly audit: AuditService,
  ) {}

  // ── Issue (05 §5) ─────────────────────────────────────────────────────

  /**
   * Issues the notice for a penalty-notice decision, inside the decision's
   * transaction. Lines and fines are copied from the schedule now (M6).
   */
  async issueForCase(
    ctx: ActionContext,
    c: CaseDocument,
    session: ClientSession,
    addresseeRole?: "owner" | "driver",
  ) {
    const role = addresseeRole ?? c.decision?.addressee;
    const personId = role === "driver" ? c.driverId : c.ownerId;
    if (!role || !personId) throw badRequest("addressee_missing", "The notice needs an addressee.");
    const person = await this.persons.findById(personId, null, { session });
    if (!person?.address)
      throw badRequest("address_missing", "The addressee has no postal address.");

    const offences = await this.offences.requireActive(c.offenceCodes);
    const lines = offences.map((o) => ({
      code: o.code,
      name: o.name,
      legalReference: o.legalReference,
      fine: o.spotFine ?? 0,
      scheduleVersion: o.version,
    }));
    return this.create(
      ctx,
      {
        caseId: c._id,
        caseNumber: c.caseNumber,
        stationId: c.stationId,
        person,
        role,
        vehicleNumber: c.vehicleNumber,
        offenceDate: c.occurredAt,
        place: c.address,
        lines,
        parentNoticeId: null,
      },
      session,
    );
  }

  private async create(
    ctx: ActionContext,
    input: {
      caseId: Types.ObjectId;
      caseNumber: string;
      stationId: Types.ObjectId | null;
      person: Person & { _id: Types.ObjectId };
      role: "owner" | "driver";
      vehicleNumber: string | null;
      offenceDate: Date;
      place: string;
      lines: PenaltyNotice["lines"];
      parentNoticeId: Types.ObjectId | null;
    },
    session: ClientSession,
  ) {
    const now = new Date();
    const noticeNumber = await nextNumber(this.conn, "PN", session, now);
    const by = ctx.user?.name ?? "System";
    const [n] = await this.notices.create(
      [
        {
          noticeNumber,
          caseId: input.caseId,
          caseNumber: input.caseNumber,
          stationId: input.stationId,
          addresseeId: input.person._id,
          addresseeRole: input.role,
          addresseeName: input.person.name,
          addresseeIdNumber:
            input.person.nic ?? input.person.businessRegNo ?? input.person.licenceNumber ?? null,
          vehicleNumber: input.vehicleNumber,
          offenceDate: input.offenceDate,
          place: input.place,
          lines: input.lines,
          amount: input.lines.reduce((sum, l) => sum + l.fine, 0),
          status: noticeMachine.initial,
          issuedAt: now,
          serviceAddress: input.person.address!,
          parentNoticeId: input.parentNoticeId,
          timeline: [
            {
              at: now,
              event: "issued",
              by,
              note: input.parentNoticeId ? "Issued to the named driver" : null,
            },
          ],
        },
      ],
      { session },
    );
    await this.audit.record(
      ctx,
      {
        action: "notice.issued",
        summary: `Penalty notice issued to the ${input.role}`,
        target: { type: "notice", id: String(n!._id), label: noticeNumber },
      },
      session,
    );
    return n!;
  }

  // ── Service (05 §5.1) ─────────────────────────────────────────────────

  async post(ctx: ActionContext, id: string, input: { postedAt: Date; postReference: string }) {
    return this.change(ctx, id, "notice.posted", { station: true }, async (n, me, session) => {
      noticeMachine.assertMove(n.status, "served");
      await this.serve(n, input.postedAt, input.postReference, n.serviceAddress, me.name, session);
      return `Posted (${input.postReference}); deemed served ${n.servedAt!.toISOString().slice(0, 10)}, due ${n.dueDate!.toISOString().slice(0, 10)}`;
    });
  }

  async serviceFailed(ctx: ActionContext, id: string, reason: string) {
    return this.change(ctx, id, "notice.service_failed", { station: true }, async (n, me) => {
      noticeMachine.assertMove(n.status, "service_failed");
      const last = n.serviceAttempts.at(-1);
      if (last) {
        last.result = "failed";
        last.note = reason;
      }
      n.status = "service_failed";
      n.dueDate = null;
      this.event(n, "service_failed", me.name, reason);
      return `Service failed: ${reason}`;
    });
  }

  /** A new address found: post again; the response time starts again (05 §5.1). */
  async reserve(
    ctx: ActionContext,
    id: string,
    input: { address: string; postedAt: Date; postReference: string },
  ) {
    return this.change(ctx, id, "notice.reserved", { station: true }, async (n, me, session) => {
      noticeMachine.assertMove(n.status, "served");
      n.serviceAddress = input.address;
      await this.persons.updateOne(
        { _id: n.addresseeId },
        { $set: { address: input.address } },
        { session },
      );
      await this.serve(n, input.postedAt, input.postReference, input.address, me.name, session);
      return `Re-served at a new address (${input.postReference})`;
    });
  }

  private async serve(
    n: PenaltyNoticeDocument,
    postedAt: Date,
    postReference: string,
    address: string,
    by: string,
    session: ClientSession,
  ) {
    n.status = "served";
    n.servedAt = await this.after("notice.deemedServed", postedAt);
    n.dueDate = await this.after("notice.respond", n.servedAt);
    n.finalDueDate = null;
    n.reminderSentAt = null;
    n.serviceAttempts.push({ postedAt, postReference, address, result: "served", note: null, by });
    this.event(n, "posted", by, `${postReference} to ${address}`);
    await this.outbox.noticeLetter(n, await this.phoneOf(n, session), session);
  }

  // ── Withdrawal ────────────────────────────────────────────────────────

  /** HQ withdraws a notice with a reason (05 §6). A paid notice is refunded (07 §8); the case closes (C4). */
  async withdraw(ctx: ActionContext, id: string, reason: string) {
    return this.change(ctx, id, "notice.withdrawn", { hqOnly: true }, async (n, me, session) => {
      await this.withdrawInSession(n, reason, me.name, session);
      await this.closeCaseIfFinished(
        n,
        `Notice ${n.noticeNumber} withdrawn: ${reason}`,
        me.name,
        session,
      );
      return `Withdrawn: ${reason}`;
    });
  }

  /** Every running notice on a case — used when HQ overrides the decision (03 §8). */
  async withdrawForCase(
    caseId: Types.ObjectId,
    reason: string,
    by: string,
    session: ClientSession,
  ) {
    const running = await this.notices.find(
      { caseId, status: { $nin: ["withdrawn", "transferred"] } },
      null,
      { session },
    );
    for (const n of running) {
      await this.withdrawInSession(n, reason, by, session);
      await n.save({ session });
    }
    return running.length;
  }

  private async withdrawInSession(
    n: PenaltyNoticeDocument,
    reason: string,
    by: string,
    session: ClientSession,
  ) {
    noticeMachine.assertMove(n.status, "withdrawn");
    const wasPaid = n.status === "paid";
    n.status = "withdrawn";
    n.withdrawnReason = reason;
    this.event(n, "withdrawn", by, reason);
    if (wasPaid && n.paymentId) {
      // Refund due — HQ approves it in the payments queue (07 §8).
      await this.conn
        .collection("payments")
        .updateOne(
          { _id: n.paymentId, status: "succeeded" },
          { $set: { refundPending: true, refundReason: `Notice withdrawn: ${reason}` } },
          { session },
        );
    }
    await this.outbox.letter(
      n,
      "withdrawn",
      "Notice withdrawn",
      `This penalty notice has been withdrawn. You don't need to do anything.${wasPaid ? " Your payment will be refunded." : ""}`,
      session,
    );
  }

  // ── Nomination (05 §6.2) ──────────────────────────────────────────────

  async nominate(
    ctx: ActionContext | null,
    id: string,
    input: { driverName: string; driverId: string; driverAddress: string; driverPhone?: string },
  ) {
    const run = async (n: PenaltyNoticeDocument, by: string) => {
      if (n.addresseeRole !== "owner")
        throw conflict(
          "cannot_nominate",
          "The named driver can't name someone else. Pay or dispute instead.",
        );
      if (n.nomination)
        throw conflict("already_nominated", "A driver has already been named for this notice.");
      if (n.status !== "served" || !n.dueDate || n.dueDate < new Date())
        throw conflict("not_open", "A driver can be named only by the due date.");
      noticeMachine.assertMove(n.status, "nominated");
      n.nomination = {
        at: new Date(),
        via: ctx ? "staff" : "addressee",
        driverName: input.driverName,
        driverId: input.driverId,
        driverAddress: input.driverAddress,
        driverPhone: input.driverPhone ?? null,
        status: "pending",
        reviewReason: null,
        previousStatus: n.status,
      };
      n.status = "nominated";
      this.event(n, "nominated", by, `${input.driverName} (${mask(input.driverId, 4)})`);
      return `Driver named: ${input.driverName}`;
    };
    if (ctx)
      return this.change(ctx, id, "notice.nominated", { station: true }, (n, me) =>
        run(n, me.name),
      );
    return this.publicChange(id, "notice.nominated", (n) => run(n, "Addressee (online)"));
  }

  /** The officer checks the named driver; accepted → a new notice to the driver (05 §6.2). */
  async reviewNomination(
    ctx: ActionContext,
    id: string,
    input: { action: "accept"; note?: string } | { action: "reject"; reason: string },
  ) {
    return this.change(
      ctx,
      id,
      "notice.nomination_reviewed",
      { station: true },
      async (n, me, session) => {
        if (n.status !== "nominated" || n.nomination?.status !== "pending")
          throw conflict("no_nomination", "There is no nomination to review.");
        if (input.action === "reject") {
          noticeMachine.assertMove(n.status, n.nomination.previousStatus);
          n.status = n.nomination.previousStatus;
          n.nomination.status = "rejected";
          n.nomination.reviewReason = input.reason;
          this.event(n, "nomination_rejected", me.name, input.reason);
          await this.outbox.letter(
            n,
            "nomination_rejected",
            "Named driver not accepted",
            `We could not accept the driver you named: ${input.reason}. This notice continues; the due date is unchanged.`,
            session,
          );
          return `Nomination rejected: ${input.reason}`;
        }

        const driver = await this.findOrCreateDriver(ctx, n, session);
        const c = await this.cases.findById(n.caseId, null, { session });
        if (!c) throw notFound("Case not found.");
        c.driverId = driver._id;
        c.driverBasis = `Named by the owner on notice ${n.noticeNumber}`;
        c.timeline.push({
          at: new Date(),
          event: "driver_named",
          by: me.name,
          byId: me.id,
          note: `${driver.name} named on ${n.noticeNumber}`,
        });
        await c.save({ session });

        const child = await this.create(
          ctx,
          {
            caseId: n.caseId,
            caseNumber: n.caseNumber,
            stationId: n.stationId,
            person: driver,
            role: "driver",
            vehicleNumber: n.vehicleNumber,
            offenceDate: n.offenceDate,
            place: n.place,
            lines: n.lines,
            parentNoticeId: n._id,
          },
          session,
        );
        noticeMachine.assertMove(n.status, "transferred");
        n.status = "transferred";
        n.childNoticeId = child._id;
        n.nomination!.status = "accepted";
        this.event(n, "transferred", me.name, `New notice ${child.noticeNumber} to ${driver.name}`);
        await this.outbox.letter(
          n,
          "nomination_accepted",
          "Named driver accepted",
          `Thank you. The notice has been transferred to the driver you named. You don't need to do anything more.`,
          session,
        );
        return `Transferred to ${driver.name}: new notice ${child.noticeNumber} (to be posted)`;
      },
    );
  }

  private async findOrCreateDriver(
    ctx: ActionContext,
    n: PenaltyNoticeDocument,
    session: ClientSession,
  ) {
    const nom = n.nomination!;
    const nic = normalizeNic(nom.driverId);
    const existing = await this.persons.findOne(
      nic ? { nic } : { licenceNumber: nom.driverId },
      null,
      { session },
    );
    if (existing) {
      if (!existing.address) {
        existing.address = nom.driverAddress;
        await existing.save({ session });
      }
      return existing;
    }
    const [p] = await this.persons.create(
      [
        {
          type: "individual",
          name: nom.driverName,
          nic: nic ?? null,
          licenceNumber: nic ? null : nom.driverId,
          address: nom.driverAddress,
          phone: nom.driverPhone,
          createdBy: requireUser(ctx).id,
        },
      ],
      { session },
    );
    return p!;
  }

  // ── Dispute (05 §6.3) ─────────────────────────────────────────────────

  async dispute(
    ctx: ActionContext | null,
    id: string,
    input: { ground: DisputeGround; explanation: string },
  ) {
    const run = async (n: PenaltyNoticeDocument, by: string) => {
      if (n.dispute)
        throw conflict(
          "already_disputed",
          "This notice has already been disputed once. The next step is court.",
        );
      if (!["served", "overdue"].includes(n.status))
        throw conflict("not_open", "This notice can't be disputed now.");
      noticeMachine.assertMove(n.status, "disputed");
      n.dispute = {
        at: new Date(),
        via: ctx ? "staff" : "addressee",
        ground: input.ground,
        explanation: input.explanation,
        status: "pending",
        reviewReason: null,
        reviewedBy: null,
        reviewedAt: null,
      };
      n.status = "disputed";
      this.event(n, "disputed", by, DISPUTE_GROUNDS[input.ground]);
      return "Dispute received — the OIC reviews it within 7 days";
    };
    if (ctx)
      return this.change(ctx, id, "notice.disputed", { station: true }, (n, me) => run(n, me.name));
    return this.publicChange(id, "notice.disputed", (n) => run(n, "Addressee (online)"));
  }

  /** The OIC (or HQ) reviews: upheld → withdrawn and the case reconsidered; rejected → 7 more days. */
  async reviewDispute(
    ctx: ActionContext,
    id: string,
    input: { action: "uphold" | "reject"; reason: string },
  ) {
    return this.change(
      ctx,
      id,
      "notice.dispute_reviewed",
      { station: true },
      async (n, me, session) => {
        if (n.status !== "disputed" || n.dispute?.status !== "pending")
          throw conflict("no_dispute", "There is no dispute to review.");
        n.dispute.reviewReason = input.reason;
        n.dispute.reviewedBy = me.name;
        n.dispute.reviewedAt = new Date();
        if (input.action === "uphold") {
          n.dispute.status = "upheld";
          await this.withdrawInSession(n, `Dispute upheld: ${input.reason}`, me.name, session);
          await this.reconsiderCase(
            n.caseId,
            `Dispute on ${n.noticeNumber} upheld: ${input.reason}`,
            me,
            session,
          );
          return "Dispute upheld — notice withdrawn; the case goes back for a new decision";
        }
        n.dispute.status = "rejected";
        noticeMachine.assertMove(n.status, "served");
        n.status = "served";
        n.dueDate = new Date(Date.now() + DISPUTE_REJECTED_EXTRA_DAYS * DAY_MS);
        n.finalDueDate = null;
        this.event(n, "dispute_rejected", me.name, input.reason);
        await this.outbox.letter(
          n,
          "dispute_rejected",
          "Dispute not accepted",
          `Your dispute was reviewed and not accepted: ${input.reason}\nYou can pay by ${letterDate(n.dueDate)}. After that the matter may go to court.`,
          session,
        );
        return `Dispute rejected — ${DISPUTE_REJECTED_EXTRA_DAYS} more days to pay`;
      },
    );
  }

  // ── Court referral (05 §6.4, D05-8) ───────────────────────────────────

  async confirmCourt(ctx: ActionContext, id: string) {
    return this.change(ctx, id, "notice.court_referral", { station: true }, async (n, me) => {
      const ready = (n.status === "overdue" && n.courtProposedAt) || n.status === "service_failed";
      if (!ready)
        throw conflict(
          "not_proposed",
          "A court referral is confirmed after the final date has passed, or when the notice can't be served.",
        );
      noticeMachine.assertMove(n.status, "court_referral");
      n.status = "court_referral";
      this.event(n, "court_referral", me.name, "Confirmed by the OIC");
      return "Court referral confirmed — the court case is prepared from the case (phase 4)";
    });
  }

  // ── Payment hooks (07) ────────────────────────────────────────────────

  /**
   * Marks the notice paid inside the payment's transaction. Returns false when
   * it can't be paid any more (already paid, withdrawn, transferred) — the
   * caller then refunds automatically (07 §12).
   */
  async markPaid(
    noticeId: Types.ObjectId,
    payment: { id: Types.ObjectId; reference: string; amount: number },
    by: string,
    session: ClientSession,
  ) {
    const n = await this.notices.findById(noticeId, null, { session });
    if (!n || !PAYABLE_STATUSES.includes(n.status)) return false;
    if (n.status === "disputed" && n.dispute) {
      n.dispute.status = "rejected";
      n.dispute.reviewReason = "Withdrawn by payment";
    }
    if (n.status === "nominated" && n.nomination) {
      n.nomination.status = "rejected";
      n.nomination.reviewReason = "Ignored — the notice was paid (05 §10)";
    }
    noticeMachine.assertMove(n.status, "paid");
    n.status = "paid";
    n.paymentId = payment.id;
    this.event(n, "paid", by, `${payment.reference}`);
    await n.save({ session });
    await this.outbox.receiptSms(
      n,
      await this.phoneOf(n, session),
      payment.reference,
      payment.amount,
      session,
    );
    await this.closeCaseIfFinished(n, `Notice ${n.noticeNumber} paid`, by, session);
    return true;
  }

  /** HQ reversed a wrongly recorded receipt (07 §6): the notice is unpaid again. */
  async reversePayment(
    noticeId: Types.ObjectId,
    reason: string,
    by: string,
    session: ClientSession,
  ) {
    const n = await this.notices.findById(noticeId, null, { session });
    if (!n || n.status !== "paid") return;
    const to: NoticeStatus = n.dueDate && n.dueDate < new Date() ? "overdue" : "served";
    noticeMachine.assertMove(n.status, to);
    n.status = to;
    n.paymentId = null;
    this.event(n, "payment_reversed", by, reason);
    await n.save({ session });
    await this.cases.updateOne(
      { _id: n.caseId, status: "closed", "decision.outcome": "penalty_notice" },
      {
        $set: { status: "decided", closedReason: null },
        $push: {
          timeline: {
            at: new Date(),
            event: "reopened",
            by,
            byId: null,
            note: `Receipt reversed on ${n.noticeNumber}`,
          },
        },
      },
      { session },
    );
  }

  async findForPayment(noticeNumber: string) {
    return this.notices.findOne({ noticeNumber }).lean<Lean>();
  }

  // ── Time limits (09 §4) ───────────────────────────────────────────────

  /** Served past the due date → overdue + reminder; past the final date → court referral proposed. */
  async sweep(now = new Date()) {
    let overdue = 0;
    let proposed = 0;
    const due = await this.notices
      .find({ status: "served", dueDate: { $lt: now } }, { _id: 1 })
      .lean();
    for (const { _id } of due) {
      await inTransaction(this.conn, async (session) => {
        const n = await this.notices.findOne({ _id, status: "served" }, null, { session });
        if (!n) return;
        noticeMachine.assertMove(n.status, "overdue");
        n.status = "overdue";
        n.reminderSentAt = now;
        n.finalDueDate = new Date(
          now.getTime() + (await this.limits.msAt("notice.finalAfterReminder", now)),
        );
        this.event(n, "overdue", "System", "Reminder sent");
        await this.outbox.reminder(n, await this.phoneOf(n, session), session);
        await n.save({ session });
        await this.audit.record(
          systemContext("notice-sweep"),
          {
            action: "notice.overdue",
            summary: "Due date passed; reminder sent",
            target: { type: "notice", id: String(n._id), label: n.noticeNumber },
          },
          session,
        );
        overdue++;
      });
    }
    const final = await this.notices
      .find({ status: "overdue", finalDueDate: { $lt: now }, courtProposedAt: null }, { _id: 1 })
      .lean();
    for (const { _id } of final) {
      const n = await this.notices.findOneAndUpdate(
        { _id, courtProposedAt: null },
        {
          $set: { courtProposedAt: now },
          $push: {
            timeline: {
              at: now,
              event: "court_proposed",
              by: "System",
              note: "Final date passed — OIC to confirm the court referral",
            },
          },
        },
        { new: true },
      );
      if (n) {
        await this.audit.record(systemContext("notice-sweep"), {
          action: "notice.court_proposed",
          summary: "Final date passed; court referral proposed",
          target: { type: "notice", id: String(n._id), label: n.noticeNumber },
        });
        proposed++;
      }
    }
    return { overdue, proposed };
  }

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => this.sweep().catch((err) => this.logger.error(err)), SWEEP_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  // ── Reading ───────────────────────────────────────────────────────────

  async list(
    ctx: ActionContext,
    q: { view: NoticeView; q?: string; page: number; pageSize: number },
  ) {
    const me = requireUser(ctx);
    const filter: QueryFilter<PenaltyNotice> = {};
    if (ctx.scope !== "all") filter.stationId = new Types.ObjectId(me.stationId!);
    const byView: Record<NoticeView, QueryFilter<PenaltyNotice>> = {
      all: {},
      to_post: { status: "issued" },
      nominations: { status: "nominated", "nomination.status": "pending" },
      disputes: { status: "disputed", "dispute.status": "pending" },
      overdue: { status: "overdue" },
      court_proposed: { status: "overdue", courtProposedAt: { $ne: null } },
      service_failed: { status: "service_failed" },
    };
    Object.assign(filter, byView[q.view]);
    if (q.q) {
      const rx = { $regex: q.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      filter.$or = [{ noticeNumber: rx }, { vehicleNumber: rx }, { caseNumber: rx }];
    }
    const [rows, total] = await Promise.all([
      this.notices
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip((q.page - 1) * q.pageSize)
        .limit(q.pageSize)
        .lean<Lean[]>(),
      this.notices.countDocuments(filter),
    ]);
    const names = await this.stations.namesByIds(
      rows.map((r) => (r.stationId ? String(r.stationId) : "")).filter(Boolean),
    );
    return {
      items: rows.map((n) => this.item(n, names)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async listForCase(ctx: ActionContext, caseId: string) {
    const rows = await this.notices
      .find({ caseId: new Types.ObjectId(caseId) })
      .sort({ issuedAt: 1 })
      .lean<Lean[]>();
    for (const r of rows) this.assertScope(ctx, r);
    const names = await this.stations.namesByIds(
      rows.map((r) => (r.stationId ? String(r.stationId) : "")).filter(Boolean),
    );
    return rows.map((n) => this.item(n, names));
  }

  async get(ctx: ActionContext, id: string): Promise<NoticeDetail> {
    const me = requireUser(ctx);
    const n = await this.load(id);
    this.assertScope(ctx, n);
    const names = await this.stations.namesByIds(n.stationId ? [String(n.stationId)] : []);
    const person = await this.persons.findById(n.addresseeId).lean();
    const payment = n.paymentId
      ? await this.conn.collection("payments").findOne({ _id: n.paymentId })
      : null;
    const isHq = me.role === "hq";
    const atStation = !!n.stationId && String(n.stationId) === me.stationId;
    const staff = isHq || atStation;
    const oicOrHq = isHq || (me.role === "station_oic" && atStation);
    return {
      ...this.item(n, names),
      addressee: {
        id: String(n.addresseeId),
        type: person?.type ?? "individual",
        name: n.addresseeName,
        nicMasked: n.addresseeIdNumber ? mask(n.addresseeIdNumber, 4) : null,
        address: n.serviceAddress,
      },
      addresseeRole: n.addresseeRole,
      lines: n.lines,
      service: {
        address: n.serviceAddress,
        attempts: n.serviceAttempts.map((a) => ({
          postedAt: a.postedAt.toISOString(),
          postReference: a.postReference,
          address: a.address,
          result: a.result,
          note: a.note,
        })),
      },
      finalDueDate: n.finalDueDate?.toISOString() ?? null,
      reminderSentAt: n.reminderSentAt?.toISOString() ?? null,
      courtProposedAt: n.courtProposedAt?.toISOString() ?? null,
      responses: [],
      nomination: n.nomination
        ? {
            driverName: n.nomination.driverName,
            driverId: mask(n.nomination.driverId, 4),
            driverAddress: n.nomination.driverAddress,
            driverPhone: n.nomination.driverPhone ?? undefined,
            at: n.nomination.at.toISOString(),
            status: n.nomination.status,
          }
        : null,
      dispute: n.dispute
        ? {
            ground: n.dispute.ground,
            explanation: n.dispute.explanation,
            at: n.dispute.at.toISOString(),
            status: n.dispute.status,
            reviewReason: n.dispute.reviewReason,
          }
        : null,
      payment: payment
        ? {
            reference: payment.reference,
            method: payment.method,
            amount: payment.amount,
            receivedAt: payment.receivedAt.toISOString(),
            test: !!payment.test,
            refunded: payment.status === "refunded",
          }
        : null,
      parentNoticeId: n.parentNoticeId ? String(n.parentNoticeId) : null,
      childNoticeId: n.childNoticeId ? String(n.childNoticeId) : null,
      legacy: n.legacy,
      timeline: n.timeline.map((t) => ({
        at: t.at.toISOString(),
        event: t.event,
        by: t.by,
        note: t.note,
      })),
      can: {
        post: staff && n.status === "issued",
        serviceFailed: staff && n.status === "served",
        reserve: staff && n.status === "service_failed",
        withdraw: isHq && noticeMachine.canMove(n.status, "withdrawn"),
        recordNomination:
          staff && n.status === "served" && n.addresseeRole === "owner" && !n.nomination,
        recordDispute: staff && ["served", "overdue"].includes(n.status) && !n.dispute,
        reviewNomination: staff && n.status === "nominated" && n.nomination?.status === "pending",
        reviewDispute: oicOrHq && n.status === "disputed" && n.dispute?.status === "pending",
        confirmCourt:
          oicOrHq &&
          ((n.status === "overdue" && !!n.courtProposedAt) || n.status === "service_failed"),
        recordReceipt: oicOrHq && PAYABLE_STATUSES.includes(n.status),
      },
    };
  }

  /** The public payment page's view (07 §5.1): number + ID number required; name masked. */
  async publicLookup(noticeNumber: string, idNumber: string): Promise<Lean | null> {
    const n = await this.notices.findOne({ noticeNumber }).lean<Lean>();
    if (!n || !n.addresseeIdNumber) return null;
    const given = normalizeNic(idNumber) ?? idNumber.replace(/\s+/g, "").toUpperCase();
    return given === n.addresseeIdNumber.toUpperCase() ? n : null;
  }

  publicView(n: Lean): PublicNoticeView {
    const payable = PAYABLE_STATUSES.includes(n.status);
    const messages: Partial<Record<NoticeStatus, string>> = {
      issued: "This notice hasn't been posted yet. It can be paid once you receive it.",
      paid: "This notice has been paid. Thank you.",
      withdrawn: "This notice has been withdrawn. You don't need to do anything.",
      transferred: "This notice was transferred to the driver you named.",
      service_failed: "Please contact the police station shown on the notice.",
      court_referral:
        "This notice has been referred to court. You can still pay until the case is filed.",
    };
    const parts = n.addresseeName.split(/\s+/);
    const masked = parts
      .map((p, i) =>
        i === parts.length - 1 ? `${p[0]}${"*".repeat(Math.max(2, p.length - 1))}` : `${p[0]}.`,
      )
      .join(" ");
    return {
      noticeNumber: n.noticeNumber,
      vehicleNumber: n.vehicleNumber,
      offenceDate: n.offenceDate.toISOString(),
      offences: n.lines.map((l) => ({ name: l.name, fine: l.fine })),
      amount: n.amount,
      dueDate: (n.finalDueDate ?? n.dueDate)?.toISOString() ?? null,
      status: n.status,
      addresseeMasked: masked,
      payable,
      canNominate:
        n.status === "served" &&
        n.addresseeRole === "owner" &&
        !n.nomination &&
        !!n.dueDate &&
        n.dueDate >= new Date(),
      canDispute: ["served", "overdue"].includes(n.status) && !n.dispute,
      message: messages[n.status] ?? null,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private async change(
    ctx: ActionContext,
    id: string,
    action: string,
    rule: { station?: boolean; hqOnly?: boolean },
    apply: (
      n: PenaltyNoticeDocument,
      me: AuthenticatedUser,
      session: ClientSession,
    ) => Promise<string>,
  ) {
    const me = requireUser(ctx);
    if (rule.hqOnly && me.role !== "hq") throw forbidden("Only HQ can do this.");
    let summary = "";
    await inTransaction(this.conn, async (session) => {
      const n = await this.notices.findById(this.oid(id), null, { session });
      if (!n) throw notFound("Notice not found.");
      this.assertScope(ctx, n);
      if (n.legacy)
        throw conflict("legacy_notice", "Old-system notices can't be changed this way (05 §9).");
      summary = await apply(n, me, session);
      await n.save({ session });
      await this.audit.record(
        ctx,
        { action, summary, target: { type: "notice", id, label: n.noticeNumber } },
        session,
      );
    });
    return this.get(ctx, id).then((d) => ({ ...d, summary }));
  }

  /** Changes made by the addressee on the public page (no account). */
  private async publicChange(
    id: string,
    action: string,
    apply: (n: PenaltyNoticeDocument) => Promise<string>,
  ) {
    let summary = "";
    await inTransaction(this.conn, async (session) => {
      const n = await this.notices.findById(this.oid(id), null, { session });
      if (!n) throw notFound("Notice not found.");
      if (n.legacy)
        throw conflict("legacy_notice", "Please contact the police station about this notice.");
      summary = await apply(n);
      await n.save({ session });
      await this.audit.record(
        { actor: { kind: "addressee", label: n.noticeNumber }, source: { ip: null, app: "pay" } },
        { action, summary, target: { type: "notice", id, label: n.noticeNumber } },
        session,
      );
    });
    const n = await this.load(id);
    return this.publicView(n);
  }

  /** C4: the case closes when its notice is finished (paid, or withdrawn by HQ). `n` is the notice being changed, not yet saved. */
  private async closeCaseIfFinished(
    n: PenaltyNoticeDocument,
    reason: string,
    by: string,
    session: ClientSession,
  ) {
    const c = await this.cases.findById(n.caseId, null, { session });
    if (!c || c.status !== "decided") return;
    const open = await this.notices.countDocuments(
      {
        caseId: n.caseId,
        _id: { $ne: n._id },
        status: { $nin: ["paid", "withdrawn", "transferred"] },
      },
      { session },
    );
    if (open > 0) return;
    caseMachine.assertMove(c.status, "closed");
    c.status = "closed";
    c.closedReason = reason;
    c.timeline.push({ at: new Date(), event: "closed", by, byId: null, note: reason });
    await c.save({ session });
  }

  /** Upheld dispute: the decision is reconsidered — the case goes back to "awaiting decision" (05 §6.3). */
  private async reconsiderCase(
    caseId: Types.ObjectId,
    note: string,
    me: AuthenticatedUser,
    session: ClientSession,
  ) {
    const c = await this.cases.findById(caseId, null, { session });
    if (!c || c.status !== "decided") return;
    caseMachine.assertMove(c.status, "recommended");
    c.status = "recommended";
    c.decision = null;
    c.dueAt = await this.after("case.decide", new Date());
    c.timeline.push({ at: new Date(), event: "reconsidered", by: me.name, byId: me.id, note });
    await c.save({ session });
  }

  private assertScope(ctx: ActionContext, n: Pick<PenaltyNotice, "stationId">) {
    const me = requireUser(ctx);
    if (ctx.scope === "all" || me.role === "hq") return;
    if (!n.stationId || String(n.stationId) !== me.stationId) throw notFound("Notice not found.");
  }

  private async load(id: string) {
    const n = await this.notices.findById(this.oid(id)).lean<Lean>();
    if (!n) throw notFound("Notice not found.");
    return n;
  }

  private async phoneOf(n: Pick<PenaltyNotice, "addresseeId">, session: ClientSession) {
    const p = await this.persons.findById(n.addresseeId, { phone: 1 }, { session }).lean();
    return p?.phone ?? null;
  }

  private event(n: PenaltyNoticeDocument, event: string, by: string, note: string | null) {
    n.timeline.push({ at: new Date(), event, by, note });
  }

  private async after(key: TimeLimitKey, from: Date) {
    return new Date(from.getTime() + (await this.limits.msAt(key, from)));
  }

  private item(n: Lean, names: Map<string, string>): NoticeListItem {
    const now = new Date();
    const due = n.finalDueDate ?? n.dueDate;
    return {
      id: String(n._id),
      noticeNumber: n.noticeNumber,
      caseId: String(n.caseId),
      caseNumber: n.caseNumber,
      status: n.status,
      addresseeName: n.addresseeName,
      vehicleNumber: n.vehicleNumber,
      amount: n.amount,
      issuedAt: n.issuedAt.toISOString(),
      servedAt: n.servedAt?.toISOString() ?? null,
      dueDate: due?.toISOString() ?? null,
      overdue: n.status === "overdue" || (!!due && due < now && ["served"].includes(n.status)),
      stationName: n.stationId ? (names.get(String(n.stationId)) ?? null) : null,
      flags: [
        ...(n.flags ?? []),
        ...(n.courtProposedAt && n.status === "overdue" ? ["court_proposed"] : []),
      ],
    };
  }

  private oid(id: string) {
    if (!Types.ObjectId.isValid(id)) throw notFound("Notice not found.");
    return new Types.ObjectId(id);
  }
}
