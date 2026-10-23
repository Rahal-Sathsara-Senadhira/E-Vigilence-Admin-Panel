// Reports and triage — docs/02-reports-and-triage.md.

import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import {
  ABUSE_REASONS,
  ABUSE_THRESHOLD,
  ABUSE_WINDOW_DAYS,
  CHANNEL_LABELS,
  HQ_ENTRY_CHANNELS,
  MAX_REPORT_AGE_DAYS,
  PRIORITY_LABELS,
  RECONSIDER_DAYS,
  REJECTION_LABELS,
  REJECTION_REASONS,
  STATION_ENTRY_CHANNELS,
  acceptReportSchema,
  createReportSchema,
  listReportsQuerySchema,
  mask,
  triageMachine,
  type CaseMatch,
  type Channel,
  type Priority,
  type RejectionReason,
  type ReportDetail,
  type ReportListItem,
  type TriageStatus,
  type VehicleType,
  isInSriLanka,
} from "@ev/shared";
import {
  Types,
  type ClientSession,
  type Connection,
  type Model,
  type PipelineStage,
  type QueryFilter,
} from "mongoose";
import type { z } from "zod";
import {
  requireUser,
  systemContext,
  type ActionContext,
  type AuthenticatedUser,
} from "../../common/context";
import { nextNumber } from "../../common/counters";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../../common/errors";
import { inTransaction } from "../../common/transaction";
import { AuditService } from "../audit/audit.service";
import { EvidenceService } from "../evidence/evidence.service";
import { CaseWorkflowService } from "../cases/case-workflow.service";
import { CasesService } from "../cases/cases.service";
import { OffencesService } from "../offences/offences.service";
import { TimeLimitsService } from "../settings/time-limits.service";
import { StationsService } from "../stations/stations.service";
import { IncidentReport, type IncidentReportDocument } from "./report.schema";
import { ReportUpdatesService } from "../citizen-updates/report-updates.service";
import { ReporterRecord } from "./reporter-record.schema";

type CreateInput = z.output<typeof createReportSchema>;
type AcceptInput = z.output<typeof acceptReportSchema>;
type ListQuery = z.output<typeof listReportsQuerySchema>;
type Lean = IncidentReport & { _id: Types.ObjectId };

/** A mobile-app report, already read and normalised by the import (app-sync). */
export interface AppReportInput {
  sourceReportId: Types.ObjectId;
  clientReportId: string | null;
  userId: string | null;
  reporterName: string | null;
  reporterPhone: string | null;
  receivedAt: Date;
  occurredAt: Date;
  location: { lat: number; lng: number } | null;
  address: string;
  vehicleNumber: string | null;
  vehicleType: VehicleType;
  vehicleDescription: string | null;
  offenceCodes: string[];
  /** The app's free-text offence, kept for HQ when it didn't match the schedule. */
  offenceText: string | null;
  description: string;
  evidenceIds: string[];
  flags: string[];
}

const DAY_MS = 86_400_000;
const EXPIRY_CHECK_MS = 10 * 60_000;

/** Channels whose reports come from the public and so need evidence to be accepted (D02-4). */
const PUBLIC_EVIDENCE_CHANNELS: readonly Channel[] = ["citizen_app", "whatsapp"];

@Injectable()
export class ReportsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReportsService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectModel(IncidentReport.name) private readonly reports: Model<IncidentReport>,
    @InjectModel(ReporterRecord.name) private readonly reporters: Model<ReporterRecord>,
    @InjectConnection() private readonly conn: Connection,
    private readonly cases: CasesService,
    private readonly offences: OffencesService,
    private readonly limits: TimeLimitsService,
    private readonly stations: StationsService,
    private readonly audit: AuditService,
    private readonly evidence: EvidenceService,
    private readonly updates: ReportUpdatesService,
    private readonly workflow: CaseWorkflowService,
  ) {}

  // ── Recording (§3, §7) ────────────────────────────────────────────────

  async create(ctx: ActionContext, input: CreateInput) {
    const me = requireUser(ctx);
    const atStation = me.role === "station_oic" || me.role === "station_officer";
    const allowed: readonly Channel[] = atStation
      ? STATION_ENTRY_CHANNELS
      : me.role === "hq"
        ? HQ_ENTRY_CHANNELS
        : [];
    if (!allowed.includes(input.channel)) {
      throw forbidden(`You can't record ${CHANNEL_LABELS[input.channel].toLowerCase()} reports.`);
    }
    this.assertRecent(input.occurredAt);
    const offences = await this.offences.requireActive(input.offenceCodes);
    const suggestedPriority = this.offences.suggestPriority(offences, input.someoneHurt);
    const receivedAt = new Date();
    const by = { id: me.id, name: me.name };

    const reporter =
      input.reporter.kind === "named"
        ? {
            kind: "named" as const,
            userId: null,
            name: input.reporter.name,
            phone: input.reporter.phone,
          }
        : { kind: "anonymous" as const, userId: null, name: null, phone: null };
    const flags: string[] = [];
    if (reporter.phone && (await this.reporterFlagged(`phone:${reporter.phone}`)))
      flags.push("reporter_flagged");

    // Station walk-in and phone reports open a case at once; officer
    // observations wait for a second officer (§7, S1). Everything recorded
    // by HQ goes to the triage queue.
    const status: TriageStatus = !atStation
      ? "pending"
      : input.channel === "officer"
        ? "pending_station"
        : "accepted";
    const triageDueAt =
      status === "pending"
        ? new Date(
            receivedAt.getTime() +
              (await this.limits.msAt(
                suggestedPriority === "P1" ? "report.triageP1" : "report.triage",
                receivedAt,
              )),
          )
        : null;

    const id = await inTransaction(this.conn, async (session) => {
      const reportNumber = await nextNumber(this.conn, "RP", session, receivedAt);
      const [doc] = await this.reports.create(
        [
          {
            reportNumber,
            channel: input.channel,
            receivedAt,
            receivedBy: { kind: "user", userId: me.id, name: me.name, role: me.role },
            reporter,
            occurredAt: input.occurredAt,
            location: { type: "Point", coordinates: [input.location.lng, input.location.lat] },
            address: input.address,
            vehicleNumber: input.plateUnknown ? null : (input.vehicleNumber ?? null),
            plateUnknown: input.plateUnknown,
            vehicleType: input.vehicleType,
            vehicleDescription: input.vehicleDescription ?? null,
            offenceCodes: input.offenceCodes,
            description: input.description,
            evidenceIds: [],
            someoneHurt: input.someoneHurt,
            stationId: atStation ? new Types.ObjectId(me.stationId!) : null,
            status,
            suggestedPriority,
            priority: status === "accepted" ? suggestedPriority : null,
            triageDueAt,
            hqReviewed: status !== "accepted",
            flags,
            history: [
              { at: receivedAt, status, by: me.name, byId: me.id, reasonCode: null, note: null },
            ],
          },
        ],
        { session },
      );
      const report = doc!;
      // The recorder's own uploads, attached in the same transaction (docs/10 §3.2).
      report.evidenceIds = await this.evidence.claim(ctx, input.evidenceIds, report, session);
      if (report.evidenceIds.length > 0) await report.save({ session });
      await this.audit.record(
        ctx,
        {
          action: "report.received",
          summary: `${CHANNEL_LABELS[input.channel]} report recorded${status === "accepted" ? " and accepted by station" : ""}`,
          target: { type: "report", id: String(report._id), label: reportNumber },
        },
        session,
      );
      if (status === "accepted")
        await this.openCase(
          ctx,
          report,
          this.caseFieldsFromReport(report, suggestedPriority),
          by,
          session,
          "Recorded at station",
        );
      return String(report._id);
    });
    return this.get(ctx, id);
  }

  // ── Reading ───────────────────────────────────────────────────────────

  async list(ctx: ActionContext, query: ListQuery) {
    const me = requireUser(ctx);
    const filter: QueryFilter<IncidentReport> = {};
    const atStation = ctx.scope === "station";
    if (atStation) filter.stationId = new Types.ObjectId(me.stationId!);

    let sort: PipelineStage.Sort["$sort"] = { receivedAt: -1 };
    switch (query.view) {
      case "queue":
        if (atStation) throw forbidden();
        filter.status = "pending";
        // Highest priority first, then oldest (§5).
        sort = { effectivePriority: 1, receivedAt: 1 };
        break;
      case "needs_info":
        if (atStation) throw forbidden();
        filter.status = "needs_info";
        sort = { "question.dueAt": 1 };
        break;
      case "station_review":
        if (atStation) throw forbidden();
        filter.status = "accepted";
        filter.hqReviewed = false;
        sort = { receivedAt: 1 };
        break;
      case "pending_station":
        filter.status = "pending_station";
        sort = { receivedAt: 1 };
        break;
      case "all":
        if (query.status) filter.status = query.status;
        break;
    }
    if (query.channel) filter.channel = query.channel;
    if (query.q) {
      const rx = { $regex: query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      filter.$or = [{ reportNumber: rx }, { vehicleNumber: rx }];
    }

    const [rows, total] = await Promise.all([
      this.reports.aggregate<Lean>([
        { $match: filter },
        { $addFields: { effectivePriority: { $ifNull: ["$priority", "$suggestedPriority"] } } },
        { $sort: sort },
        { $skip: (query.page - 1) * query.pageSize },
        { $limit: query.pageSize },
      ]),
      this.reports.countDocuments(filter),
    ]);
    const names = await this.stations.namesByIds(
      rows.map((r) => (r.stationId ? String(r.stationId) : "")).filter(Boolean),
    );
    return {
      items: rows.map((r) => this.listItem(r, names)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(ctx: ActionContext, id: string): Promise<ReportDetail> {
    const r = await this.readable(ctx, id);
    const me = requireUser(ctx);
    const names = await this.stations.namesByIds(r.stationId ? [String(r.stationId)] : []);
    const record = await this.reporterRecordOf(r);
    // Reporter identity: HQ and the handling station only (docs/10 §5.2); dev sees it masked.
    const canSeeReporter = me.role !== "dev";
    const caseDoc = r.caseId ? await this.cases.findById(r.caseId) : null;
    const lockValid = r.lock && r.lock.until > new Date();

    if (me.role === "dev") {
      await this.audit.record(ctx, {
        action: "support.report_viewed",
        summary: "Viewed a report for support",
        target: { type: "report", id: String(r._id), label: r.reportNumber },
      });
    }

    return {
      ...this.listItem(r, names),
      reporter: {
        kind: r.reporter.kind,
        name: canSeeReporter ? r.reporter.name : r.reporter.name ? "Hidden" : null,
        phone: canSeeReporter
          ? r.reporter.phone
          : r.reporter.phone
            ? mask(r.reporter.phone, 3)
            : null,
        flagged: !!record?.flagged,
        suspended: !!record?.suspended,
        abuseCount: record ? this.recentAbuse(record.abuse).length : 0,
      },
      receivedBy: r.receivedBy.name,
      vehicleDescription: r.vehicleDescription ?? null,
      location: r.location
        ? { lat: r.location.coordinates[1]!, lng: r.location.coordinates[0]! }
        : null,
      description: r.description,
      evidenceIds: r.evidenceIds.map(String),
      question: r.question
        ? {
            text: r.question.text,
            askedAt: r.question.askedAt.toISOString(),
            dueAt: r.question.dueAt.toISOString(),
            answer: r.question.answer ?? null,
            answeredAt: r.question.answeredAt ? r.question.answeredAt.toISOString() : null,
          }
        : null,
      caseId: r.caseId ? String(r.caseId) : null,
      caseNumber: caseDoc?.caseNumber ?? null,
      rejection: r.rejection
        ? {
            code: r.rejection.code,
            reporterMessage: REJECTION_REASONS[r.rejection.code],
            note: r.rejection.note ?? null,
          }
        : null,
      reviewedByHq: r.hqReviewed,
      history: r.history.map((h) => ({
        at: h.at.toISOString(),
        status: h.status,
        by: h.by,
        reasonCode: h.reasonCode ?? null,
        note: h.note ?? null,
      })),
      lock: lockValid
        ? { by: r.lock!.name, byId: r.lock!.userId, until: r.lock!.until.toISOString() }
        : null,
      canReconsiderUntil:
        r.status === "rejected" && r.rejection
          ? new Date(r.rejection.at.getTime() + RECONSIDER_DAYS * DAY_MS).toISOString()
          : null,
    };
  }

  async matches(ctx: ActionContext, id: string): Promise<CaseMatch[]> {
    const r = await this.readable(ctx, id);
    return this.cases.findMatches(r);
  }

  // ── Triage lock (§5) ──────────────────────────────────────────────────

  /** Marks the report "in triage by <name>" so two HQ staff don't decide it at once. */
  async lock(ctx: ActionContext, id: string) {
    const me = requireUser(ctx);
    const until = new Date(Date.now() + (await this.limits.msAt("report.triageLock")));
    const now = new Date();
    const res = await this.reports.findOneAndUpdate(
      {
        _id: this.oid(id),
        $or: [{ lock: null }, { "lock.until": { $lte: now } }, { "lock.userId": me.id }],
      },
      { $set: { lock: { userId: me.id, name: me.name, until } } },
      { new: true },
    );
    if (!res) {
      const r = await this.reports.findById(this.oid(id)).lean();
      if (!r) throw notFound("Report not found.");
      throw conflict("report_locked", `${r.lock?.name ?? "Someone"} is triaging this report.`);
    }
    return { by: me.name, until: until.toISOString() };
  }

  async unlock(ctx: ActionContext, id: string) {
    const me = requireUser(ctx);
    await this.reports.updateOne(
      { _id: this.oid(id), "lock.userId": me.id },
      { $set: { lock: null } },
    );
  }

  // ── Triage outcomes (§6) ──────────────────────────────────────────────

  /** §6.1 — opens a case with what police conclude; the report keeps what was said. */
  async accept(ctx: ActionContext, id: string, input: AcceptInput) {
    const me = requireUser(ctx);
    return this.decide(ctx, id, async (r, session) => {
      triageMachine.assertMove(r.status, "accepted");
      if (r.status !== "pending")
        throw badRequest("not_in_queue", "Only reports in the triage queue can be accepted here.");
      this.assertRecent(input.occurredAt);
      await this.offences.requireActive(input.offenceCodes);
      if (
        PUBLIC_EVIDENCE_CHANNELS.includes(r.channel) &&
        r.evidenceIds.length === 0 &&
        !input.noEvidenceReason
      ) {
        throw new ApiError(400, "validation", "Check the highlighted fields.", {
          fields: {
            noEvidenceReason:
              "This report has no evidence. Record why it can still proceed (e.g. corroborated by another report).",
          },
        });
      }

      const fields = {
        priority: input.priority,
        offenceCodes: input.offenceCodes,
        occurredAt: input.occurredAt,
        location: input.location,
        address: input.address,
        vehicleNumber: input.plateUnknown ? null : (input.vehicleNumber ?? null),
        plateUnknown: input.plateUnknown,
        vehicleType: input.vehicleType,
      };
      const note = [
        input.noEvidenceReason ? `Accepted without evidence: ${input.noEvidenceReason}` : null,
        input.note ?? null,
      ]
        .filter(Boolean)
        .join(" · ");
      r.priority = input.priority;
      this.move(r, "accepted", me, null, note || null);
      const c = await this.openCase(
        ctx,
        r,
        fields,
        { id: me.id, name: me.name },
        session,
        note || null,
      );
      // Dispatched in the same step (02 §6.1): automatically, or to the station HQ chose.
      let sent: string;
      try {
        sent = await this.workflow.dispatchInSession(
          ctx,
          c,
          { stationId: input.stationId, reason: input.dispatchReason },
          session,
        );
      } catch (err) {
        // No station found automatically: the case waits, undispatched, for HQ to choose one.
        if (
          input.stationId ||
          (err as { getResponse?: () => { error?: { code?: string } } }).getResponse?.()?.error
            ?.code !== "no_station"
        )
          throw err;
        sent = "Not dispatched: no active station found — choose one on the case.";
      }
      await c.save({ session });
      return `Accepted (${PRIORITY_LABELS[input.priority]}) — case ${c.caseNumber} opened. ${sent}`;
    });
  }

  /** §6.2 — attach to a case describing the same incident. A closed case is not reopened. */
  async merge(ctx: ActionContext, id: string, caseId: string, note: string | null) {
    const me = requireUser(ctx);
    return this.decide(ctx, id, async (r, session) => {
      triageMachine.assertMove(r.status, "merged");
      const stationCase = r.status === "accepted" ? r.caseId : null;
      if (r.status === "accepted" && r.hqReviewed)
        throw badRequest("already_reviewed", "This report has already been reviewed.");
      const target = await this.cases.findById(caseId, session);
      if (!target) throw notFound("Case not found.");
      if (stationCase && stationCase.equals(target._id))
        throw badRequest("same_case", "The report is already on this case.");

      if (stationCase) {
        await this.cases.closeAtReview(
          stationCase,
          r._id,
          { id: me.id, name: me.name },
          `Merged into ${target.caseNumber} at HQ review`,
          session,
        );
      }
      await this.cases.attachReport(target._id, r._id, { id: me.id, name: me.name }, note, session);
      r.caseId = target._id;
      r.hqReviewed = true;
      this.move(r, "merged", me, null, note);
      return `Merged into case ${target.caseNumber}${target.status === "closed" ? " (closed — attached as additional information, not reopened)" : ""}`;
    });
  }

  /** §6.3 — ask the reporter a question; no reply within the limit rejects as no_response. */
  async needsInfo(ctx: ActionContext, id: string, question: string) {
    const me = requireUser(ctx);
    return this.decide(ctx, id, async (r) => {
      triageMachine.assertMove(r.status, "needs_info");
      if (r.reporter.kind === "anonymous") {
        throw badRequest(
          "anonymous_reporter",
          "Anonymous reporters can't be asked. Accept, merge or reject the report.",
        );
      }
      const askedAt = new Date();
      const dueAt = new Date(
        askedAt.getTime() + (await this.limits.msAt("report.needsInfoReply", askedAt)),
      );
      r.question = {
        text: question,
        askedAt,
        askedBy: me.name,
        dueAt,
        answer: null,
        answeredAt: null,
      };
      this.move(r, "needs_info", me, null, question);
      return "Reporter asked for more information";
    });
  }

  /** The reporter's answer, recorded by staff (phone) — app replies arrive through the import. */
  async recordReply(ctx: ActionContext, id: string, answer: string) {
    const me = requireUser(ctx);
    return this.decide(ctx, id, async (r) => {
      if (r.status !== "needs_info" || !r.question)
        throw badRequest("no_question", "This report isn't waiting for an answer.");
      r.question.answer = answer;
      r.question.answeredAt = new Date();
      // Back to its original place in the queue (receivedAt unchanged, §6.3).
      this.move(r, "pending", me, null, "Reporter answered");
      return "Reporter's answer recorded; report back in the queue";
    });
  }

  /** §6.4 — with a reason code; fabricated/abusive count towards reporter abuse (§10). */
  async reject(ctx: ActionContext, id: string, code: RejectionReason, note: string | null) {
    const me = requireUser(ctx);
    return this.decide(
      ctx,
      id,
      async (r, session) => {
        triageMachine.assertMove(r.status, "rejected");
        if (r.status === "accepted" && r.hqReviewed)
          throw badRequest("already_reviewed", "This report has already been reviewed.");
        if (r.status === "pending_station") this.assertSecondOfficer(me, r);
        if (r.status === "accepted" && r.caseId) {
          await this.cases.closeAtReview(
            r.caseId,
            r._id,
            { id: me.id, name: me.name },
            `Report rejected at HQ review: ${REJECTION_LABELS[code]}`,
            session,
          );
          r.caseId = null;
          r.hqReviewed = true;
        }
        r.rejection = { code, note, at: new Date(), by: me.name };
        this.move(r, "rejected", me, code, note);
        if (ABUSE_REASONS.includes(code)) await this.countAbuse(ctx, r, code, session);
        return `Rejected: ${REJECTION_LABELS[code]}`;
      },
      { allowStation: true },
    );
  }

  /** Within 30 days of a rejection, HQ can send the report back to the queue (§6.4). */
  async reconsider(ctx: ActionContext, id: string, reason: string) {
    const me = requireUser(ctx);
    return this.decide(ctx, id, async (r, session) => {
      triageMachine.assertMove(r.status, "pending");
      if (r.status !== "rejected" || !r.rejection)
        throw badRequest("not_rejected", "Only rejected reports can be reconsidered.");
      if (Date.now() - r.rejection.at.getTime() > RECONSIDER_DAYS * DAY_MS) {
        throw badRequest("too_late", `Rejections can be reconsidered for ${RECONSIDER_DAYS} days.`);
      }
      // A reconsidered rejection no longer counts against the reporter.
      if (ABUSE_REASONS.includes(r.rejection.code)) {
        const key = this.reporterKey(r);
        if (key)
          await this.reporters.updateOne(
            { key },
            { $pull: { abuse: { reportId: r._id } } },
            { session },
          );
      }
      r.rejection = null;
      this.move(r, "pending", me, null, reason);
      return "Reconsidered — back in the triage queue";
    });
  }

  /** §6.2 — HQ can undo a merge; the report returns to the queue. */
  async undoMerge(ctx: ActionContext, id: string, reason: string) {
    const me = requireUser(ctx);
    return this.decide(ctx, id, async (r, session) => {
      triageMachine.assertMove(r.status, "pending");
      if (r.status !== "merged" || !r.caseId)
        throw badRequest("not_merged", "This report isn't merged.");
      await this.cases.detachReport(r.caseId, r._id, { id: me.id, name: me.name }, reason, session);
      r.caseId = null;
      this.move(r, "pending", me, null, reason);
      return "Merge undone — back in the triage queue";
    });
  }

  /** HQ confirms a station-accepted report at review (§7). */
  async markReviewed(ctx: ActionContext, id: string) {
    const me = requireUser(ctx);
    return this.decide(ctx, id, async (r) => {
      if (r.status !== "accepted" || r.hqReviewed)
        throw badRequest("not_awaiting_review", "This report isn't awaiting HQ review.");
      r.hqReviewed = true;
      r.history.push({
        at: new Date(),
        status: "accepted",
        by: me.name,
        byId: me.id,
        reasonCode: null,
        note: "Reviewed by HQ",
      });
      return "Station acceptance reviewed by HQ";
    });
  }

  async changePriority(ctx: ActionContext, id: string, priority: Priority, reason: string) {
    return this.decide(ctx, id, async (r) => {
      if (r.status !== "pending" && r.status !== "needs_info") {
        throw badRequest(
          "not_in_triage",
          "Priority can be changed here only before the report is decided.",
        );
      }
      const before = r.priority ?? r.suggestedPriority;
      if (before === priority) throw badRequest("no_change", "That is already the priority.");
      r.priority = priority;
      return `Priority ${before} → ${priority}: ${reason}`;
    });
  }

  /** Officer-observed report accepted by another officer or the OIC (§7, S1). */
  async stationAccept(ctx: ActionContext, id: string) {
    const me = requireUser(ctx);
    return this.decide(
      ctx,
      id,
      async (r, session) => {
        triageMachine.assertMove(r.status, "accepted");
        if (r.status !== "pending_station")
          throw badRequest(
            "not_pending_station",
            "This report isn't waiting for a second officer.",
          );
        this.assertSecondOfficer(me, r);
        r.priority = r.suggestedPriority;
        r.hqReviewed = false;
        this.move(r, "accepted", me, null, "Accepted by second officer");
        const c = await this.openCase(
          ctx,
          r,
          this.caseFieldsFromReport(r, r.suggestedPriority),
          { id: me.id, name: me.name },
          session,
          "Officer-observed report accepted at station",
        );
        return `Accepted at station — case ${c.caseNumber} opened`;
      },
      { allowStation: true, stationOnly: true },
    );
  }

  // ── Mobile app (docs/11 §4, §8) ───────────────────────────────────────

  /**
   * Turns one mobile-app report into a report here, once (by its source id).
   * Invalid reports are imported and rejected at once with the matching
   * reason, so the citizen is told why (§8). Reports from suspended accounts
   * are not imported (§6). Returns the new report's id, or null.
   */
  async receiveFromApp(input: AppReportInput): Promise<string | null> {
    const ctx = systemContext("mobile-app-import");
    const key = `user:${input.userId}`;
    if (input.userId && (await this.reporters.exists({ key, suspended: true }))) {
      await this.updates.publish(
        {
          channel: "citizen_app",
          sourceReportId: input.sourceReportId,
          reportNumber: "",
          reporter: { userId: input.userId },
        },
        {
          type: "rejected",
          title: "Not accepted",
          message:
            "Your account can't send reports at the moment. Contact Sri Lanka Police if you think this is a mistake.",
          question: null,
        },
      );
      await this.audit.record(ctx, {
        action: "report.import_refused",
        summary: "Mobile-app report from a suspended account not imported",
        target: { type: "reporter", id: key, label: null },
      });
      return null;
    }

    const known = input.offenceCodes.length > 0 ? await this.offences.list() : [];
    const offences = known.filter((o) => input.offenceCodes.includes(o.code));
    const flags = [...input.flags];
    if (offences.length === 0) flags.push("offence_not_recognised");
    if (!input.location) flags.push("no_location");
    if (input.evidenceIds.length === 0) flags.push("no_evidence");
    if (input.userId && (await this.reporterFlagged(key))) flags.push("reporter_flagged");

    // §8: invalid reports are rejected immediately, with the reason the citizen sees.
    let rejection: RejectionReason | null = null;
    if (Date.now() - input.occurredAt.getTime() > MAX_REPORT_AGE_DAYS * DAY_MS)
      rejection = "too_old";
    else if (input.location && !isInSriLanka(input.location.lat, input.location.lng))
      rejection = "outside_jurisdiction";

    const suggestedPriority = this.offences.suggestPriority(offences);
    const status: TriageStatus = rejection ? "rejected" : "pending";
    const triageDueAt =
      status === "pending"
        ? new Date(
            input.receivedAt.getTime() +
              (await this.limits.msAt(
                suggestedPriority === "P1" ? "report.triageP1" : "report.triage",
                input.receivedAt,
              )),
          )
        : null;
    const now = new Date();

    try {
      return await inTransaction(this.conn, async (session) => {
        const reportNumber = await nextNumber(this.conn, "RP", session, input.receivedAt);
        const [doc] = await this.reports.create(
          [
            {
              reportNumber,
              channel: "citizen_app",
              receivedAt: input.receivedAt,
              receivedBy: { kind: "system", userId: null, name: "Mobile app", role: null },
              reporter: {
                kind: "citizen",
                userId: input.userId,
                name: input.reporterName,
                phone: input.reporterPhone,
              },
              sourceReportId: input.sourceReportId,
              clientReportId: input.clientReportId,
              occurredAt: input.occurredAt,
              location: input.location
                ? { type: "Point", coordinates: [input.location.lng, input.location.lat] }
                : null,
              address: input.address || "Not given",
              vehicleNumber: input.vehicleNumber,
              plateUnknown: !input.vehicleNumber,
              vehicleType: input.vehicleType,
              vehicleDescription: input.vehicleDescription,
              offenceCodes: offences.map((o) => o.code),
              description: input.description,
              evidenceIds: [],
              stationId: null,
              status,
              suggestedPriority,
              priority: null,
              triageDueAt,
              hqReviewed: true,
              flags,
              rejection: rejection
                ? { code: rejection, note: "Rejected on import", at: now, by: "System" }
                : null,
              history: [
                {
                  at: input.receivedAt,
                  status: "pending" as const,
                  by: "Mobile app",
                  byId: null,
                  reasonCode: null,
                  note: input.offenceText ? `Reporter's offence: ${input.offenceText}` : null,
                },
                ...(rejection
                  ? [
                      {
                        at: now,
                        status: "rejected" as const,
                        by: "System",
                        byId: null,
                        reasonCode: rejection,
                        note: "Rejected on import",
                      },
                    ]
                  : []),
              ],
            },
          ],
          { session },
        );
        const report = doc!;
        report.evidenceIds = await this.evidence.claim(ctx, input.evidenceIds, report, session);
        await report.save({ session });
        await this.audit.record(
          ctx,
          {
            action: "report.received",
            summary: `Mobile app report imported${rejection ? ` and rejected: ${REJECTION_LABELS[rejection]}` : ""}`,
            target: { type: "report", id: String(report._id), label: reportNumber },
          },
          session,
        );
        await this.updates.publish(
          report,
          {
            type: "received",
            title: "Received",
            message: "Thank you. Your report has been received.",
            question: null,
          },
          session,
        );
        if (rejection) await this.tellCitizen(report, session);
        return String(report._id);
      });
    } catch (err) {
      // Imported already (another instance got there first) — idempotent by source id.
      if (
        (err as { code?: number }).code === 11000 &&
        (err as { keyPattern?: object }).keyPattern &&
        "sourceReportId" in (err as { keyPattern: object }).keyPattern
      ) {
        return null;
      }
      throw err;
    }
  }

  /** A reply from the mobile app to "needs information" (docs/11 §3, report_replies). */
  async applyAppReply(
    sourceReportId: Types.ObjectId,
    userId: string | null,
    answer: string,
  ): Promise<boolean> {
    const ctx = systemContext("mobile-app-import");
    return inTransaction(this.conn, async (session) => {
      const r = await this.reports.findOne(
        { sourceReportId, "reporter.userId": userId, status: "needs_info" },
        null,
        { session },
      );
      if (!r || !r.question) return false;
      r.question.answer = answer.slice(0, 1000);
      r.question.answeredAt = new Date();
      triageMachine.assertMove(r.status, "pending");
      r.status = "pending";
      r.history.push({
        at: new Date(),
        status: "pending",
        by: "Reporter (mobile app)",
        byId: null,
        reasonCode: null,
        note: "Reporter answered",
      });
      await r.save({ session });
      await this.audit.record(
        ctx,
        {
          action: "report.pending",
          summary: "Reporter answered in the mobile app; back in the queue",
          target: { type: "report", id: String(r._id), label: r.reportNumber },
        },
        session,
      );
      return true;
    });
  }

  // ── Time limit: unanswered questions (§6.3) ───────────────────────────

  /** Rejects reports whose question went unanswered past its limit. Returns how many. */
  async expireUnanswered(now = new Date()): Promise<number> {
    const due = await this.reports
      .find({ status: "needs_info", "question.dueAt": { $lte: now } }, { _id: 1 })
      .lean();
    const ctx = systemContext("needs-info-expiry");
    let count = 0;
    for (const { _id } of due) {
      await inTransaction(this.conn, async (session) => {
        const r = await this.reports.findOne({ _id, status: "needs_info" }, null, { session });
        if (!r) return;
        r.rejection = { code: "no_response", note: null, at: now, by: "System" };
        r.history.push({
          at: now,
          status: "rejected",
          by: "System",
          byId: null,
          reasonCode: "no_response",
          note: null,
        });
        r.status = "rejected";
        await r.save({ session });
        await this.audit.record(
          ctx,
          {
            action: "report.rejected",
            summary: "Rejected: no response from reporter",
            target: { type: "report", id: String(r._id), label: r.reportNumber },
          },
          session,
        );
        await this.tellCitizen(r, session);
        count++;
      });
    }
    return count;
  }

  // Phase 5 moves this to the job scheduler (docs/09).
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => {
      this.expireUnanswered().catch((err) => this.logger.error(err));
    }, EXPIRY_CHECK_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /**
   * Runs one triage decision: loads the report, refuses if someone else holds
   * the triage lock, applies the change, releases the lock, saves, and writes
   * the audit entry — all in one transaction.
   */
  private async decide(
    ctx: ActionContext,
    id: string,
    change: (r: IncidentReportDocument, session: ClientSession) => Promise<string>,
    opts: { allowStation?: boolean; stationOnly?: boolean } = {},
  ) {
    const me = requireUser(ctx);
    const isHq = me.role === "hq";
    const isStation = me.role === "station_oic" || me.role === "station_officer";
    if (opts.stationOnly ? !isStation : !(isHq || (opts.allowStation && isStation)))
      throw forbidden();

    await inTransaction(this.conn, async (session) => {
      const r = await this.reports.findById(this.oid(id), null, { session });
      if (!r) throw notFound("Report not found.");
      if (isStation) {
        // Stations act only on their own officer-observed reports.
        if (String(r.stationId) !== me.stationId || r.status !== "pending_station")
          throw forbidden();
      }
      if (r.lock && r.lock.until > new Date() && r.lock.userId !== me.id) {
        throw conflict("report_locked", `${r.lock.name} is triaging this report.`);
      }
      const before = r.status;
      const summary = await change(r, session);
      r.lock = null;
      await r.save({ session });
      await this.audit.record(
        ctx,
        {
          action: before === r.status ? "report.updated" : `report.${r.status}`,
          summary,
          reason: before !== r.status ? (r.history.at(-1)?.note ?? null) : null,
          target: { type: "report", id: String(r._id), label: r.reportNumber },
        },
        session,
      );
      if (before !== r.status) await this.tellCitizen(r, session);
    });
    return this.get(ctx, id);
  }

  /** Mobile-app reporters see each milestone (docs/11 §5, docs/02 §9). */
  private async tellCitizen(r: IncidentReportDocument, session: ClientSession) {
    const update = this.updates.updateFor(r.status, {
      question: r.question?.text ?? null,
      rejection: r.rejection?.code ?? null,
    });
    if (update) await this.updates.publish(r, update, session);
  }

  private move(
    r: IncidentReportDocument,
    to: TriageStatus,
    me: AuthenticatedUser,
    reasonCode: RejectionReason | null,
    note: string | null,
  ) {
    triageMachine.assertMove(r.status, to);
    r.status = to;
    r.history.push({ at: new Date(), status: to, by: me.name, byId: me.id, reasonCode, note });
  }

  private async openCase(
    ctx: ActionContext,
    r: IncidentReportDocument,
    fields: Omit<Parameters<CasesService["open"]>[0], "reportId" | "stationId" | "by" | "note">,
    by: { id: string; name: string },
    session: ClientSession,
    note: string | null,
  ) {
    // A station-recorded case opens already accepted there; the officer who
    // accepts it is its investigating officer (02 §7, D01-1).
    const atStation = r.stationId
      ? {
          stationName: (await this.stations.nameOf(String(r.stationId))) ?? "Station",
          officerId: by.id,
          officerName: by.name,
          workStartDueAt: new Date(
            Date.now() +
              (await this.limits.msAt(
                fields.priority === "P1" ? "case.workStartP1" : "case.workStart",
              )),
          ),
        }
      : undefined;
    const c = await this.cases.open(
      {
        ...fields,
        reportId: r._id,
        stationId: r.stationId ? String(r.stationId) : null,
        by,
        note,
        acceptedAtStation: atStation,
      },
      session,
    );
    r.caseId = c._id;
    await r.save({ session });
    await this.audit.record(
      ctx,
      {
        action: "case.opened",
        summary: `Case opened from report ${r.reportNumber}`,
        target: { type: "case", id: String(c._id), label: c.caseNumber },
      },
      session,
    );
    return c;
  }

  private caseFieldsFromReport(r: IncidentReportDocument, priority: Priority) {
    return {
      priority,
      offenceCodes: r.offenceCodes,
      occurredAt: r.occurredAt,
      location: { lat: r.location!.coordinates[1]!, lng: r.location!.coordinates[0]! },
      address: r.address,
      vehicleNumber: r.vehicleNumber,
      plateUnknown: r.plateUnknown,
      vehicleType: r.vehicleType,
    };
  }

  /** S1: the observing officer can't also accept their own observation. */
  private assertSecondOfficer(me: AuthenticatedUser, r: IncidentReportDocument) {
    if (r.receivedBy.userId === me.id) {
      throw forbidden(
        "Another officer or the OIC must accept your own observation.",
        "separation_of_duties",
      );
    }
  }

  private assertRecent(occurredAt: Date) {
    if (Date.now() - occurredAt.getTime() > MAX_REPORT_AGE_DAYS * DAY_MS) {
      throw new ApiError(400, "validation", "Check the highlighted fields.", {
        fields: {
          occurredAt: `Reports must be about something that happened in the last ${MAX_REPORT_AGE_DAYS} days.`,
        },
      });
    }
  }

  /** Station staff read only their station's reports; HQ and dev all. */
  private async readable(ctx: ActionContext, id: string): Promise<Lean> {
    const r = await this.reports.findById(this.oid(id)).lean<Lean>();
    if (!r) throw notFound("Report not found.");
    if (ctx.scope === "station" && String(r.stationId) !== requireUser(ctx).stationId)
      throw notFound("Report not found.");
    return r;
  }

  private reporterKey(r: Pick<IncidentReport, "reporter">): string | null {
    if (r.reporter.kind === "citizen" && r.reporter.userId) return `user:${r.reporter.userId}`;
    if (r.reporter.kind === "named" && r.reporter.phone) return `phone:${r.reporter.phone}`;
    return null;
  }

  private recentAbuse<T extends { at: Date }>(events: T[]) {
    const since = Date.now() - ABUSE_WINDOW_DAYS * DAY_MS;
    return events.filter((e) => e.at.getTime() >= since);
  }

  private async reporterRecordOf(r: Pick<IncidentReport, "reporter">) {
    const key = this.reporterKey(r);
    return key ? this.reporters.findOne({ key }).lean() : null;
  }

  private async reporterFlagged(key: string) {
    return !!(await this.reporters.exists({ key, flagged: true }));
  }

  /** §10: 3 fabricated/abusive rejections in 90 days flags the reporter. */
  private async countAbuse(
    ctx: ActionContext,
    r: IncidentReportDocument,
    code: RejectionReason,
    session: ClientSession,
  ) {
    const key = this.reporterKey(r);
    if (!key) return;
    const record = await this.reporters.findOneAndUpdate(
      { key },
      { $push: { abuse: { reportId: r._id, code, at: new Date() } } },
      { upsert: true, new: true, session },
    );
    if (!record.flagged && this.recentAbuse(record.abuse).length >= ABUSE_THRESHOLD) {
      await this.reporters.updateOne(
        { key },
        { $set: { flagged: true, flaggedAt: new Date() } },
        { session },
      );
      await this.audit.record(
        ctx,
        {
          action: "reporter.flagged",
          summary: `Reporter flagged: ${ABUSE_THRESHOLD} fabricated or abusive reports in ${ABUSE_WINDOW_DAYS} days`,
          target: { type: "reporter", id: key, label: null },
        },
        session,
      );
    }
  }

  private listItem(r: Lean, stationNames: Map<string, string>): ReportListItem {
    const now = new Date();
    const lockValid = r.lock && r.lock.until > now;
    return {
      id: String(r._id),
      reportNumber: r.reportNumber,
      channel: r.channel,
      receivedAt: r.receivedAt.toISOString(),
      occurredAt: r.occurredAt.toISOString(),
      status: r.status,
      priority: r.priority ?? null,
      suggestedPriority: r.suggestedPriority,
      vehicleNumber: r.vehicleNumber ?? null,
      vehicleType: r.vehicleType,
      offenceCodes: r.offenceCodes,
      address: r.address,
      evidenceCount: r.evidenceIds.length,
      stationName: r.stationId ? (stationNames.get(String(r.stationId)) ?? null) : null,
      lockedBy: lockValid ? r.lock!.name : null,
      overdue: r.status === "pending" && !!r.triageDueAt && r.triageDueAt < now,
      dueAt:
        r.status === "needs_info" && r.question
          ? r.question.dueAt.toISOString()
          : r.triageDueAt
            ? r.triageDueAt.toISOString()
            : null,
      flags: r.flags,
      reporterFlagged: r.flags.includes("reporter_flagged"),
    };
  }

  private oid(id: string) {
    if (!Types.ObjectId.isValid(id)) throw notFound("Report not found.");
    return new Types.ObjectId(id);
  }
}
