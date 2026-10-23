// A case's life — docs/03 (dispatch, acceptance, investigating officer,
// merge, reopen), docs/04 §6 (investigation work), docs/05 §3–4
// (recommendation and decision), with separation of duties (docs/01 §5).
//
// Every change: one transaction, checked against the case state machine, a
// timeline entry, an audit entry, and the next stage's deadline (docs/09).

import { Injectable } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import {
  OUTCOME_LABELS,
  RETURNS_BEFORE_DISPUTE,
  caseMachine,
  type AddresseeRole,
  type NfaReason,
  type Outcome,
  type TimeLimitKey,
} from "@ev/shared";
import { Types, type ClientSession, type Connection, type Model } from "mongoose";
import { requireUser, type ActionContext, type AuthenticatedUser } from "../../common/context";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../../common/errors";
import { inTransaction } from "../../common/transaction";
import { AuditService } from "../audit/audit.service";
import { ReportUpdatesService } from "../citizen-updates/report-updates.service";
import { OffencesService } from "../offences/offences.service";
import { PeopleService } from "../people/people.service";
import { TimeLimitsService } from "../settings/time-limits.service";
import { Case, type CaseDocument } from "./case.schema";
import { NoticesService } from "../notices/notices.service";
import { Dispatcher, type StationChoice } from "./dispatcher";

export type CaseChange = (c: CaseDocument, session: ClientSession) => Promise<string>;

/** Outcomes that end the case at decision (C4): nothing else has to happen for them. */
const FINISHED_AT_DECISION: readonly Outcome[] = ["nfa", "warning"];

@Injectable()
export class CaseWorkflowService {
  constructor(
    @InjectModel(Case.name) private readonly cases: Model<Case>,
    @InjectConnection() private readonly conn: Connection,
    private readonly dispatcher: Dispatcher,
    private readonly limits: TimeLimitsService,
    private readonly offences: OffencesService,
    private readonly people: PeopleService,
    private readonly updates: ReportUpdatesService,
    private readonly audit: AuditService,
    private readonly notices: NoticesService,
  ) {}

  // ── Dispatch (03 §5) ──────────────────────────────────────────────────

  /**
   * HQ dispatches (or re-dispatches) a case: automatically — jurisdiction,
   * then nearest, skipping stations that returned it — or to a station HQ
   * chooses, with a reason. A "disputed jurisdiction" case needs HQ's choice.
   */
  async dispatch(ctx: ActionContext, id: string, input: { stationId?: string; reason?: string }) {
    return this.change(ctx, id, "case.dispatched", (c, session) =>
      this.dispatchInSession(ctx, c, input, session),
    );
  }

  /** Also used by triage, which dispatches in the same step as accepting (02 §6.1). */
  async dispatchInSession(
    ctx: ActionContext,
    c: CaseDocument,
    input: { stationId?: string; reason?: string },
    session: ClientSession,
  ) {
    const me = requireUser(ctx);
    if (me.role !== "hq") throw forbidden("Only HQ dispatches cases.");
    if (["recommended", "decided", "closed"].includes(c.status)) {
      throw conflict(
        "too_late_to_dispatch",
        "The investigating station owns the outcome now. HQ can override the decision first (03 §5.4).",
      );
    }
    const point = { lng: c.location.coordinates[0]!, lat: c.location.coordinates[1]! };
    let choice: StationChoice | null;
    if (input.stationId) {
      choice = await this.dispatcher.named(
        new Types.ObjectId(input.stationId),
        point,
        "manual",
        session,
      );
      if (!choice) throw badRequest("station_inactive", "Choose an active station.");
    } else {
      if (c.flags.includes("disputed_jurisdiction")) {
        throw badRequest(
          "disputed_jurisdiction",
          "This case has been returned twice. Choose the station yourself, with a reason.",
        );
      }
      const returnedBy = c.dispatches.filter((d) => d.returnedAt).map((d) => d.stationId);
      choice = await this.dispatcher.choose(point, returnedBy);
      if (!choice)
        throw conflict(
          "no_station",
          "No active station could be found for this location. Choose one yourself.",
        );
    }

    const from = c.status;
    const previous = c.dispatches.at(-1);
    caseMachine.assertMove(c.status, "dispatched");
    c.status = "dispatched";
    c.stationId = choice.stationId;
    c.investigatingOfficerId = null;
    c.investigatingOfficerName = null;
    c.flags = [
      ...c.flags.filter(
        (f) =>
          !["overlapping_jurisdictions", "unverified_station", "no_active_officers"].includes(f),
      ),
      ...choice.flags,
    ];
    const now = new Date();
    c.dispatches.push({
      stationId: choice.stationId,
      stationName: choice.stationName,
      at: now,
      by: me.name,
      method: choice.method,
      distanceKm: choice.distanceKm,
      flags: choice.flags,
      reason: input.reason ?? null,
      acceptedAt: null,
      acceptedBy: null,
      returnedAt: null,
      returnedBy: null,
      returnReason: null,
    });
    c.dueAt = await this.deadline(c.priority === "P1" ? "case.acceptP1" : "case.accept", now);
    const moved =
      from !== "open" && from !== "returned" && previous
        ? ` (moved from ${previous.stationName})`
        : "";
    this.event(
      c,
      "dispatched",
      me,
      `${choice.stationName} — ${choice.method === "manual" ? `chosen by HQ: ${input.reason}` : choice.method}${moved}`,
    );
    return `Dispatched to ${choice.stationName}${moved}${choice.flags.length ? ` — warnings: ${choice.flags.join(", ")}` : ""}`;
  }

  /** The station takes the case; the accepting officer becomes the investigating officer (D01-1). */
  async accept(ctx: ActionContext, id: string) {
    return this.change(ctx, id, "case.accepted", async (c) => {
      const me = requireUser(ctx);
      this.assertAtStation(me, c);
      caseMachine.assertMove(c.status, "accepted");
      const d = c.dispatches.at(-1)!;
      d.acceptedAt = new Date();
      d.acceptedBy = me.name;
      c.status = "accepted";
      c.investigatingOfficerId = me.id;
      c.investigatingOfficerName = me.name;
      c.dueAt = await this.deadline(
        c.priority === "P1" ? "case.workStartP1" : "case.workStart",
        d.at,
      );
      this.event(
        c,
        "accepted",
        me,
        `Accepted at ${d.stationName}; investigating officer ${me.name}`,
      );
      return `Accepted at ${d.stationName}`;
    });
  }

  /** Back to HQ as "not our area" — only before work starts (03 §5.3). */
  async returnToHq(ctx: ActionContext, id: string, reason: string) {
    return this.change(ctx, id, "case.returned", async (c) => {
      const me = requireUser(ctx);
      this.assertAtStation(me, c);
      if (!["dispatched", "accepted"].includes(c.status) || c.workStartedAt) {
        throw conflict(
          "work_started",
          "Work has been recorded on this case, so it can't be returned. Ask HQ to re-dispatch it.",
        );
      }
      const d = c.dispatches.at(-1)!;
      if (c.flags.includes("disputed_jurisdiction") && d.method === "manual") {
        throw forbidden(
          "HQ chose your station after this case was disputed. Add a note for HQ instead of returning it.",
          "return_not_allowed",
        );
      }
      caseMachine.assertMove(c.status, "returned");
      c.status = "returned";
      d.returnedAt = new Date();
      d.returnedBy = me.name;
      d.returnReason = reason;
      c.returnCount += 1;
      c.stationId = null;
      c.investigatingOfficerId = null;
      c.investigatingOfficerName = null;
      c.dueAt = null;
      const disputed =
        c.returnCount >= RETURNS_BEFORE_DISPUTE && !c.flags.includes("disputed_jurisdiction");
      if (disputed) c.flags.push("disputed_jurisdiction");
      this.event(c, "returned", me, reason);
      return `Returned to HQ by ${d.stationName}${disputed ? " — now disputed jurisdiction: HQ must choose the station" : ""}`;
    });
  }

  /** The OIC (or HQ) sets the investigating officer — an active officer at the case's station (03 §6). */
  async assignOfficer(ctx: ActionContext, id: string, officerId: string, note: string | null) {
    return this.change(ctx, id, "case.officer_assigned", async (c, session) => {
      const me = requireUser(ctx);
      if (!this.isOicHere(me, c) && me.role !== "hq")
        throw forbidden("Only the station's OIC or HQ assigns the investigating officer.");
      if (!["accepted", "investigating"].includes(c.status))
        throw conflict(
          "not_assignable",
          "Officers are assigned once the station has accepted the case.",
        );
      const officer = await this.conn.collection("users").findOne(
        {
          _id: new Types.ObjectId(officerId),
          staff: true,
          active: true,
          stationId: c.stationId,
          role: { $in: ["station_officer", "station_oic"] },
        },
        { session },
      );
      if (!officer)
        throw badRequest("officer_not_here", "Choose an active officer at this station.");
      c.investigatingOfficerId = String(officer._id);
      c.investigatingOfficerName = officer.name as string;
      this.event(c, "officer_assigned", me, `${officer.name}${note ? ` — ${note}` : ""}`);
      return `Investigating officer: ${officer.name}`;
    });
  }

  // ── Investigation work (04 §6) ────────────────────────────────────────

  /**
   * Runs one piece of investigation work: only the investigating officer,
   * the station's OIC or HQ (D03-8), only while the case is being worked.
   * The first work moves an accepted case to investigating (C2).
   */
  async work(ctx: ActionContext, id: string, action: string, apply: CaseChange) {
    return this.change(ctx, id, action, async (c, session) => {
      const me = requireUser(ctx);
      if (!this.canWork(me, c))
        throw forbidden(
          "Only the investigating officer or the OIC can record work on this case (D03-8).",
        );
      if (!["accepted", "investigating"].includes(c.status)) {
        throw conflict(
          "not_being_worked",
          c.status === "recommended"
            ? "The case is waiting for a decision. Ask the decider to send it back first."
            : "This case can't be worked on now.",
        );
      }
      if (c.status === "accepted") {
        caseMachine.assertMove(c.status, "investigating");
        c.status = "investigating";
        c.workStartedAt = new Date();
        const acceptedAt = c.dispatches.at(-1)?.acceptedAt ?? new Date();
        c.dueAt = await this.deadline("case.recommend", acceptedAt);
        this.event(c, "work_started", me, null);
      }
      return apply(c, session);
    });
  }

  // ── Recommendation and decision (05 §3–4) ─────────────────────────────

  async recommend(
    ctx: ActionContext,
    id: string,
    input: {
      outcome: Outcome;
      addressee?: AddresseeRole;
      nfaReason?: NfaReason;
      justification: string;
    },
  ) {
    return this.change(ctx, id, "case.recommended", async (c) => {
      const me = requireUser(ctx);
      if (c.investigatingOfficerId !== me.id)
        throw forbidden("Only the investigating officer recommends an outcome.");
      const ready = await this.readiness(c);
      if (!ready.ready)
        throw new ApiError(
          400,
          "not_ready",
          `Not ready to recommend: ${ready.missing.join("; ")}.`,
        );
      await this.assertOutcomeAllowed(c, input.outcome, input.addressee ?? null);
      caseMachine.assertMove(c.status, "recommended");
      c.status = "recommended";
      c.recommendation = {
        outcome: input.outcome,
        addressee: input.outcome === "nfa" ? null : (input.addressee ?? null),
        nfaReason: input.outcome === "nfa" ? (input.nfaReason ?? null) : null,
        justification: input.justification,
        by: me.name,
        byId: me.id,
        at: new Date(),
      };
      c.dueAt = await this.deadline("case.decide", new Date());
      this.event(c, "recommended", me, `${OUTCOME_LABELS[input.outcome]} — ${input.justification}`);
      return `Recommended: ${OUTCOME_LABELS[input.outcome]}`;
    });
  }

  /**
   * The OIC decides; HQ decides when the OIC was the investigating officer
   * (S2). Nobody decides their own recommendation (S1). Approve, change the
   * outcome (with a reason), or send back for more work (C3).
   */
  async decide(
    ctx: ActionContext,
    id: string,
    input:
      | { action: "approve"; note?: string }
      | {
          action: "change";
          outcome: Outcome;
          addressee?: AddresseeRole;
          nfaReason?: NfaReason;
          reason: string;
        }
      | { action: "send_back"; reason: string },
  ) {
    return this.change(
      ctx,
      id,
      input.action === "send_back" ? "case.sent_back" : "case.decided",
      async (c, session) => {
        const me = requireUser(ctx);
        const who = this.decider(me, c);
        if (!who.allowed) throw forbidden(who.reason, "separation_of_duties");
        if (c.status !== "recommended" || !c.recommendation)
          throw conflict("no_recommendation", "There is no recommendation to decide.");

        if (input.action === "send_back") {
          caseMachine.assertMove(c.status, "investigating");
          c.status = "investigating";
          c.recommendation = null;
          c.dueAt = await this.deadline("case.recommend", new Date());
          this.event(c, "sent_back", me, input.reason);
          return `Sent back for more work: ${input.reason}`;
        }

        const rec = c.recommendation;
        const outcome = input.action === "change" ? input.outcome : rec.outcome;
        const addressee =
          outcome === "nfa"
            ? null
            : input.action === "change"
              ? (input.addressee ?? rec.addressee)
              : rec.addressee;
        const nfaReason =
          outcome === "nfa"
            ? input.action === "change"
              ? (input.nfaReason ?? null)
              : rec.nfaReason
            : null;
        if (outcome === "nfa" && !nfaReason)
          throw badRequest("nfa_reason_required", "Choose the reason for no further action.");
        if (outcome !== "nfa" && !addressee)
          throw badRequest("addressee_required", "Choose who it is addressed to.");
        await this.assertOutcomeAllowed(c, outcome, addressee);

        caseMachine.assertMove(c.status, "decided");
        c.status = "decided";
        c.decision = {
          outcome,
          addressee,
          nfaReason,
          changed: input.action === "change",
          note: input.action === "change" ? input.reason : (input.note ?? null),
          by: me.name,
          byId: me.id,
          role: me.role,
          at: new Date(),
        };
        c.dueAt = null;
        this.event(
          c,
          "decided",
          me,
          `${OUTCOME_LABELS[outcome]}${input.action === "change" ? ` (changed from ${OUTCOME_LABELS[rec.outcome]}: ${input.reason})` : ""}`,
        );

        // C4: warnings and no-further-action are finished at decision.
        if (FINISHED_AT_DECISION.includes(outcome)) {
          caseMachine.assertMove(c.status, "closed");
          c.status = "closed";
          c.closedReason = outcome === "nfa" ? `No further action: ${nfaReason}` : "Warning issued";
          this.event(c, "closed", me, c.closedReason);
        }
        // A penalty notice is issued in the same step, ready for the station to post (05 §5).
        let issued = "";
        if (outcome === "penalty_notice") {
          const notice = await this.notices.issueForCase(ctx, c, session, addressee ?? undefined);
          issued = ` — notice ${notice.noticeNumber} issued for posting`;
        }
        await this.tellReporters(
          c,
          outcome === "nfa" ? "closed_no_action" : "action_taken",
          session,
        );
        return `Decided: ${OUTCOME_LABELS[outcome]}${c.status === "closed" ? " — case closed" : ""}${issued}`;
      },
    );
  }

  /** HQ overrides a decision, with a reason: the case returns to "awaiting decision" (03 §8). */
  async override(ctx: ActionContext, id: string, reason: string) {
    return this.change(ctx, id, "case.overridden", async (c, session) => {
      const me = requireUser(ctx);
      if (me.role !== "hq") throw forbidden("Only HQ overrides decisions.");
      if (c.status !== "decided" || !c.decision)
        throw conflict(
          "not_decided",
          "Only a decided case (not yet closed) can be overridden. Reopen a closed case instead.",
        );
      caseMachine.assertMove(c.status, "recommended");
      const was = c.decision.outcome;
      c.status = "recommended";
      c.decision = null;
      c.dueAt = await this.deadline("case.decide", new Date());
      // Running notices on this decision are withdrawn (paid ones refunded) — 05 §4.
      const withdrawn = await this.notices.withdrawForCase(
        c._id,
        `Decision overridden: ${reason}`,
        me.name,
        session,
      );
      this.event(c, "overridden", me, `${OUTCOME_LABELS[was]} overridden: ${reason}`);
      return `Decision (${OUTCOME_LABELS[was]}) overridden — back to awaiting decision${withdrawn ? `; ${withdrawn} notice(s) withdrawn` : ""}`;
    });
  }

  /** HQ reopens a closed case, with a reason; finished outcomes stay as they are (C5). */
  async reopen(ctx: ActionContext, id: string, reason: string) {
    return this.change(ctx, id, "case.reopened", async (c) => {
      const me = requireUser(ctx);
      if (me.role !== "hq") throw forbidden("Only HQ reopens cases.");
      if (c.mergedInto)
        throw conflict("merged", "This case was merged into another. Work on that case instead.");
      if (!c.stationId)
        throw conflict(
          "no_station",
          "This case was closed before it reached a station. Open a new case from its report instead.",
        );
      caseMachine.assertMove(c.status, "investigating");
      c.status = "investigating";
      c.closedReason = null;
      c.recommendation = null;
      c.dueAt = await this.deadline("case.recommend", new Date());
      this.event(c, "reopened", me, reason);
      return "Reopened";
    });
  }

  /**
   * HQ merges two cases about the same incident, neither decided (03 §7):
   * reports, evidence, notes and statements move; this case closes as
   * "merged into …".
   */
  async merge(ctx: ActionContext, id: string, intoId: string, reason: string) {
    return this.change(ctx, id, "case.merged", async (c, session) => {
      const me = requireUser(ctx);
      if (me.role !== "hq") throw forbidden("Only HQ merges cases.");
      if (id === intoId) throw badRequest("same_case", "Choose a different case.");
      const into = await this.cases.findById(intoId, null, { session });
      if (!into) throw notFound("Case not found.");
      for (const x of [c, into]) {
        if (["recommended", "decided", "closed"].includes(x.status))
          throw conflict(
            "too_late_to_merge",
            `${x.caseNumber} is already ${x.status}; only undecided cases can be merged.`,
          );
      }
      into.reportIds = [...new Set([...into.reportIds, ...c.reportIds].map(String))].map(
        (s) => new Types.ObjectId(s),
      );
      into.evidenceIds.push(...c.evidenceIds);
      into.notes.push(...c.notes);
      into.statements.push(...c.statements);
      into.timeline.push({
        at: new Date(),
        event: "merged_in",
        by: me.name,
        byId: me.id,
        note: `${c.caseNumber} merged in: ${reason}`,
      });
      await into.save({ session });
      await this.conn
        .collection("incident_reports")
        .updateMany({ _id: { $in: c.reportIds } }, { $set: { caseId: into._id } }, { session });

      caseMachine.assertMove(c.status, "closed");
      c.status = "closed";
      c.mergedInto = into._id;
      c.closedReason = `Merged into ${into.caseNumber}`;
      c.dueAt = null;
      this.event(c, "merged", me, `Into ${into.caseNumber}: ${reason}`);
      return `Merged into ${into.caseNumber}`;
    });
  }

  // ── Rules ─────────────────────────────────────────────────────────────

  /** docs/04 §6 "Ready to recommend". */
  async readiness(c: CaseDocument | Case): Promise<{ ready: boolean; missing: string[] }> {
    const missing: string[] = [];
    if (c.status !== "investigating") missing.push("the case must be under investigation");
    if (!c.evidenceReview) missing.push("complete the evidence review");
    if (c.offenceCodes.length === 0) missing.push("confirm the offences");
    return { ready: missing.length === 0, missing };
  }

  /** docs/05 §3 — which outcome is allowed, and who it is addressed to. */
  private async assertOutcomeAllowed(
    c: CaseDocument,
    outcome: Outcome,
    addressee: AddresseeRole | null,
  ) {
    const offences = await this.offences.requireActive(c.offenceCodes);
    if (outcome === "penalty_notice" && offences.some((o) => o.outcome === "court")) {
      throw badRequest(
        "court_only_offence",
        "This case includes a court-only offence, so it can't be a penalty notice. Refer it to court (05 §10).",
      );
    }
    if (outcome === "warning") {
      if (offences.some((o) => o.severity !== "minor"))
        throw badRequest("warning_not_allowed", "Warnings are only for minor offences (D05-4).");
      const personId = addressee === "driver" ? c.driverId : c.ownerId;
      const repeat = await this.people.repeatCounts(c.vehicleId, personId, c._id);
      if (repeat.vehicle > 0 || repeat.person > 0) {
        throw badRequest(
          "warning_not_allowed",
          "No warning: this vehicle or person had an enforcement outcome in the last 12 months (D05-4).",
        );
      }
    }
    if (outcome === "nfa") return;

    // Penalty notice, warning, court: the addressee must be identified, with an address (04 §6).
    const personId = addressee === "driver" ? c.driverId : c.ownerId;
    if (!personId)
      throw badRequest(
        "addressee_missing",
        addressee === "driver" ? "Identify the driver first." : "Trace the vehicle's owner first.",
      );
    const person = await this.people.findPerson(personId);
    if (!person?.address)
      throw badRequest(
        "address_missing",
        `Record ${person?.name ?? "the addressee"}'s postal address first.`,
      );
    if (addressee === "owner" && c.flags.includes("suspected_false_plate")) {
      throw badRequest(
        "false_plate",
        "The plate is suspected false — no notice to the registered owner (04 §8). Refer to court or close with a reason.",
      );
    }
  }

  /** Who may decide this recommendation (S1, S2, 05 §4). */
  decider(
    me: AuthenticatedUser,
    c: Pick<Case, "stationId" | "recommendation" | "investigatingOfficerId">,
  ): { allowed: boolean; reason: string } {
    if (!c.recommendation)
      return { allowed: false, reason: "There is no recommendation to decide." };
    if (c.recommendation.byId === me.id)
      return { allowed: false, reason: "You can't decide your own recommendation (S1)." };
    if (me.role === "hq") return { allowed: true, reason: "" };
    if (!this.isOicHere(me, c))
      return { allowed: false, reason: "Only the station's OIC (or HQ) decides." };
    if (c.investigatingOfficerId === me.id)
      return { allowed: false, reason: "You investigated this case, so HQ decides (S2)." };
    return { allowed: true, reason: "" };
  }

  canWork(me: AuthenticatedUser, c: Pick<Case, "stationId" | "investigatingOfficerId">) {
    return me.role === "hq" || c.investigatingOfficerId === me.id || this.isOicHere(me, c);
  }

  isOicHere(me: AuthenticatedUser, c: Pick<Case, "stationId">) {
    return me.role === "station_oic" && !!c.stationId && String(c.stationId) === me.stationId;
  }

  private assertAtStation(me: AuthenticatedUser, c: CaseDocument) {
    const atStation =
      (me.role === "station_officer" || me.role === "station_oic") &&
      !!c.stationId &&
      String(c.stationId) === me.stationId;
    if (!atStation) throw forbidden("Only staff of the station the case was sent to can do this.");
  }

  // ── Plumbing ──────────────────────────────────────────────────────────

  /** Loads the case, applies the change, saves, and audits — in one transaction. */
  async change(ctx: ActionContext, id: string, action: string, apply: CaseChange) {
    if (!Types.ObjectId.isValid(id)) throw notFound("Case not found.");
    let summary = "";
    let caseNumber = "";
    await inTransaction(this.conn, async (session) => {
      const c = await this.cases.findById(id, null, { session });
      if (!c) throw notFound("Case not found.");
      this.assertCanSee(requireUser(ctx), ctx, c);
      summary = await apply(c, session);
      await c.save({ session });
      caseNumber = c.caseNumber;
      await this.audit.record(
        ctx,
        { action, summary, target: { type: "case", id, label: c.caseNumber } },
        session,
      );
    });
    return { id, caseNumber, summary };
  }

  /** Station staff act only on their own station's cases; HQ on all. */
  assertCanSee(
    me: AuthenticatedUser,
    ctx: ActionContext,
    c: Pick<Case, "stationId" | "dispatches">,
  ) {
    if (me.role === "hq" || me.role === "dev") return;
    if (ctx.scope === "all") return;
    if (!c.stationId || String(c.stationId) !== me.stationId) throw notFound("Case not found.");
  }

  private event(c: CaseDocument, event: string, me: AuthenticatedUser, note: string | null) {
    c.timeline.push({ at: new Date(), event, by: me.name, byId: me.id, note });
  }

  private async deadline(key: TimeLimitKey, from: Date) {
    return new Date(from.getTime() + (await this.limits.msAt(key, from)));
  }

  /** Mobile-app reporters on this case see the outcome milestone (02 §9) — never the outcome type or amount. */
  private async tellReporters(
    c: CaseDocument,
    type: "action_taken" | "closed_no_action",
    session: ClientSession,
  ) {
    const reports = await this.conn
      .collection("incident_reports")
      .find(
        { _id: { $in: c.reportIds }, channel: "citizen_app" },
        { projection: { channel: 1, sourceReportId: 1, reportNumber: 1, reporter: 1 }, session },
      )
      .toArray();
    for (const r of reports) {
      await this.updates.publish(
        {
          channel: r.channel,
          sourceReportId: r.sourceReportId,
          reportNumber: r.reportNumber,
          reporter: { userId: r.reporter?.userId ?? null },
        },
        type === "action_taken"
          ? {
              type,
              title: "Action taken",
              message: "Police have taken action on your report. Thank you.",
              question: null,
            }
          : {
              type,
              title: "Closed — no action possible",
              message: "Police looked into your report but couldn't take action this time.",
              question: null,
            },
        session,
      );
    }
  }
}
