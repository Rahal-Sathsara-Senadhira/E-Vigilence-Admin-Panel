// Reading cases — lists per role (docs/03 §6 OIC queue, docs/12 §4) and the
// case detail, including what the signed-in user may do next.

import { Injectable } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import {
  caseMachine,
  listCasesQuerySchema,
  type CaseDetail,
  type CaseListItem,
  type Paged,
} from "@ev/shared";
import { Types, type Connection, type Model, type QueryFilter } from "mongoose";
import type { z } from "zod";
import { requireUser, type ActionContext } from "../../common/context";
import { forbidden, notFound } from "../../common/errors";
import { AuditService } from "../audit/audit.service";
import { PeopleService } from "../people/people.service";
import { StationsService } from "../stations/stations.service";
import { Case } from "./case.schema";
import { CaseWorkflowService } from "./case-workflow.service";

type ListQuery = z.output<typeof listCasesQuerySchema>;
type Lean = Case & { _id: Types.ObjectId };

@Injectable()
export class CaseQueryService {
  constructor(
    @InjectModel(Case.name) private readonly cases: Model<Case>,
    @InjectConnection() private readonly conn: Connection,
    private readonly workflow: CaseWorkflowService,
    private readonly people: PeopleService,
    private readonly stations: StationsService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: ActionContext, q: ListQuery): Promise<Paged<CaseListItem>> {
    const me = requireUser(ctx);
    const filter: QueryFilter<Case> = {};
    const atStation = ctx.scope !== "all";
    if (atStation) filter.stationId = new Types.ObjectId(me.stationId!);
    else if (q.stationId) filter.stationId = new Types.ObjectId(q.stationId);

    switch (q.view) {
      case "to_accept":
        filter.status = "dispatched";
        break;
      case "mine":
        filter.investigatingOfficerId = me.id;
        filter.status = { $in: ["accepted", "investigating", "recommended"] };
        break;
      case "no_officer":
        filter.investigatingOfficerId = null;
        filter.status = { $in: ["accepted", "investigating"] };
        break;
      case "awaiting_decision":
        filter.status = "recommended";
        break;
      case "returned":
        if (atStation) throw forbidden();
        filter.status = "returned";
        break;
      case "open":
        if (atStation) throw forbidden();
        filter.status = "open";
        break;
      case "all":
        if (q.status && caseMachine.isState(q.status)) filter.status = q.status;
        break;
    }
    if (q.q) {
      const rx = { $regex: q.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      filter.$or = [{ caseNumber: rx }, { vehicleNumber: rx }];
    }

    const sort: Record<string, 1 | -1> =
      q.view === "all" ? { updatedAt: -1 } : { dueAt: 1, createdAt: 1 };
    const [rows, total] = await Promise.all([
      this.cases
        .find(filter)
        .sort(sort)
        .skip((q.page - 1) * q.pageSize)
        .limit(q.pageSize)
        .lean<Lean[]>()
        .then((rows) => rows.map(withDefaults)),
      this.cases.countDocuments(filter),
    ]);
    const names = await this.stations.namesByIds(
      rows.map((r) => (r.stationId ? String(r.stationId) : "")).filter(Boolean),
    );
    return {
      items: rows.map((r) => this.item(r, names)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async get(ctx: ActionContext, id: string): Promise<CaseDetail> {
    const me = requireUser(ctx);
    if (!Types.ObjectId.isValid(id)) throw notFound("Case not found.");
    const found = await this.cases.findById(id).lean<Lean>();
    const c = found ? withDefaults(found) : null;
    if (!c) throw notFound("Case not found.");
    this.workflow.assertCanSee(me, ctx, c);
    // Station officers read every case at their station; only the investigating officer and the OIC work on it (D03-8).

    if (me.role === "dev") {
      await this.audit.record(ctx, {
        action: "support.case_viewed",
        summary: "Viewed a case for support",
        target: { type: "case", id, label: c.caseNumber },
      });
    }

    const names = await this.stations.namesByIds(c.stationId ? [String(c.stationId)] : []);
    const reports = await this.conn
      .collection("incident_reports")
      .find(
        { _id: { $in: c.reportIds } },
        { projection: { reportNumber: 1, channel: 1, status: 1 } },
      )
      .toArray();
    // Person details only for those allowed to see them (persons.view: HQ, the station, the investigating officer).
    const seesPeople =
      me.role === "hq" ||
      ((me.role === "station_oic" || me.id === c.investigatingOfficerId) &&
        String(c.stationId) === me.stationId);
    const [vehicle, owner, driver, repeat] = await Promise.all([
      this.people.vehicleSummary(c.vehicleId),
      seesPeople ? this.people.summaryOf(c.ownerId) : null,
      seesPeople ? this.people.summaryOf(c.driverId) : null,
      this.people.repeatCounts(c.vehicleId, c.driverId ?? c.ownerId, c._id),
    ]);
    const readiness = await this.workflow.readiness(c as unknown as Case);
    const isHq = me.role === "hq";
    const atStation =
      (me.role === "station_oic" || me.role === "station_officer") &&
      String(c.stationId) === me.stationId;
    const working = ["accepted", "investigating"].includes(c.status);

    return {
      ...this.item(c, names),
      location: { lat: c.location.coordinates[1]!, lng: c.location.coordinates[0]! },
      plateUnknown: c.plateUnknown,
      reportIds: reports.map((r) => ({
        id: String(r._id),
        reportNumber: r.reportNumber,
        channel: r.channel,
        status: r.status,
      })),
      investigatingOfficerId: c.investigatingOfficerId,
      dispatches: c.dispatches.map((d) => ({
        stationId: String(d.stationId),
        stationName: d.stationName,
        at: d.at.toISOString(),
        by: d.by,
        method: d.method,
        distanceKm: d.distanceKm,
        flags: d.flags,
        reason: d.reason,
        acceptedAt: d.acceptedAt?.toISOString() ?? null,
        acceptedBy: d.acceptedBy,
        returnedAt: d.returnedAt?.toISOString() ?? null,
        returnedBy: d.returnedBy,
        returnReason: d.returnReason,
      })),
      returnCount: c.returnCount,
      vehicle,
      owner,
      driver,
      evidenceReview: c.evidenceReview
        ? {
            plateReadable: c.evidenceReview.plateReadable,
            vehicleMatches: c.evidenceReview.vehicleMatches,
            timePlaceConsistent: c.evidenceReview.timePlaceConsistent,
            notEdited: c.evidenceReview.notEdited,
            offenceVisible: c.evidenceReview.offenceVisible,
            note: c.evidenceReview.note,
            by: c.evidenceReview.by,
            at: c.evidenceReview.at.toISOString(),
          }
        : null,
      notes: c.notes.map((n) => ({ at: n.at.toISOString(), by: n.by, text: n.text })),
      statements: seesPeople
        ? c.statements.map((s) => ({
            at: s.at.toISOString(),
            by: s.by,
            from: s.from,
            name: s.name,
            takenAt: s.takenAt.toISOString(),
            summary: s.summary,
            evidenceIds: s.evidenceIds.map(String),
          }))
        : [],
      evidenceIds: c.evidenceIds.map(String),
      recommendation: c.recommendation
        ? { ...c.recommendation, at: c.recommendation.at.toISOString() }
        : null,
      decision: c.decision
        ? ({
            ...c.decision,
            byId: undefined,
            at: c.decision.at.toISOString(),
          } as CaseDetail["decision"])
        : null,
      closedReason: c.closedReason,
      repeatOffender: repeat.vehicle + repeat.person > 0 ? repeat : null,
      timeline: c.timeline.map((t) => ({
        at: t.at.toISOString(),
        event: t.event,
        by: t.by,
        note: t.note,
      })),
      can: {
        dispatch:
          isHq &&
          ["open", "returned", "dispatched", "accepted", "investigating"].includes(c.status),
        accept: atStation && c.status === "dispatched",
        return: atStation && ["dispatched", "accepted"].includes(c.status) && !c.workStartedAt,
        assignOfficer: (isHq || this.workflow.isOicHere(me, c)) && working,
        work: this.workflow.canWork(me, c) && working,
        recommend: c.investigatingOfficerId === me.id && c.status === "investigating",
        decide: c.status === "recommended" && this.workflow.decider(me, c).allowed,
        override: isHq && c.status === "decided",
        reopen: isHq && c.status === "closed" && !c.mergedInto && !!c.stationId,
        merge: isHq && !["recommended", "decided", "closed"].includes(c.status),
      },
      readyToRecommend: readiness,
    };
  }

  private item(c: Lean, stationNames: Map<string, string>): CaseListItem {
    const now = new Date();
    return {
      id: String(c._id),
      caseNumber: c.caseNumber,
      status: c.status,
      priority: c.priority,
      vehicleNumber: c.vehicleNumber,
      vehicleType: c.vehicleType,
      offenceCodes: c.offenceCodes,
      occurredAt: c.occurredAt.toISOString(),
      address: c.address,
      stationId: c.stationId ? String(c.stationId) : null,
      stationName: c.stationId ? (stationNames.get(String(c.stationId)) ?? null) : null,
      investigatingOfficer: c.investigatingOfficerName,
      reportCount: c.reportIds.length,
      dueAt: c.dueAt ? c.dueAt.toISOString() : null,
      overdue: !!c.dueAt && c.dueAt < now,
      flags: c.flags,
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}

/**
 * Lean reads skip schema defaults, so a case saved before a field existed
 * (or migrated from the old system) would lack it. Fill them in once here.
 */
function withDefaults(c: Lean): Lean {
  return {
    ...c,
    flags: c.flags ?? [],
    dispatches: c.dispatches ?? [],
    returnCount: c.returnCount ?? 0,
    notes: c.notes ?? [],
    statements: c.statements ?? [],
    evidenceIds: c.evidenceIds ?? [],
    timeline: c.timeline ?? [],
    reportIds: c.reportIds ?? [],
    investigatingOfficerId: c.investigatingOfficerId ?? null,
    investigatingOfficerName: c.investigatingOfficerName ?? null,
    vehicleId: c.vehicleId ?? null,
    ownerId: c.ownerId ?? null,
    driverId: c.driverId ?? null,
    evidenceReview: c.evidenceReview ?? null,
    recommendation: c.recommendation ?? null,
    decision: c.decision ?? null,
    dueAt: c.dueAt ?? null,
    closedReason: c.closedReason ?? null,
    mergedInto: c.mergedInto ?? null,
    workStartedAt: c.workStartedAt ?? null,
  };
}
