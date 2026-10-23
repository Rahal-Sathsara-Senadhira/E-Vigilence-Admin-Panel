// Cases — the phase-1 part of docs/03: opening a case from triage, attaching
// merged reports, closing a station case HQ rejects or merges at review, and
// finding cases that may describe the same incident (docs/02 §5).

import { Injectable } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { caseMachine, type CaseMatch, type Priority, type VehicleType } from "@ev/shared";
import { Types, type ClientSession, type Connection, type Model } from "mongoose";
import { nextNumber } from "../../common/counters";
import { notFound } from "../../common/errors";
import { Case, type CaseDocument } from "./case.schema";

const DAY_MS = 86_400_000;
/** "Same offence within ~150 m" — docs/02 §5. */
const NEARBY_METRES = 150;

export interface OpenCaseInput {
  reportId: Types.ObjectId;
  priority: Priority;
  offenceCodes: string[];
  occurredAt: Date;
  location: { lat: number; lng: number };
  address: string;
  vehicleNumber: string | null;
  plateUnknown: boolean;
  vehicleType: VehicleType;
  stationId: string | null;
  by: { id: string | null; name: string };
  note?: string | null;
  /**
   * Station-recorded cases open already accepted at that station (02 §7);
   * this officer becomes the investigating officer (D01-1).
   */
  acceptedAtStation?: {
    stationName: string;
    officerId: string;
    officerName: string;
    workStartDueAt: Date;
  };
}

@Injectable()
export class CasesService {
  constructor(
    @InjectModel(Case.name) private readonly cases: Model<Case>,
    @InjectConnection() private readonly conn: Connection,
  ) {}

  async open(input: OpenCaseInput, session: ClientSession): Promise<CaseDocument> {
    const caseNumber = await nextNumber(this.conn, "TC", session);
    const [doc] = await this.cases.create(
      [
        {
          caseNumber,
          reportIds: [input.reportId],
          priority: input.priority,
          offenceCodes: input.offenceCodes,
          occurredAt: input.occurredAt,
          location: { type: "Point", coordinates: [input.location.lng, input.location.lat] },
          address: input.address,
          vehicleNumber: input.vehicleNumber,
          plateUnknown: input.plateUnknown,
          vehicleType: input.vehicleType,
          stationId: input.stationId ? new Types.ObjectId(input.stationId) : null,
          status: input.acceptedAtStation ? "accepted" : caseMachine.initial,
          ...(input.acceptedAtStation && input.stationId
            ? {
                dispatches: [
                  {
                    stationId: new Types.ObjectId(input.stationId),
                    stationName: input.acceptedAtStation.stationName,
                    at: new Date(),
                    by: input.by.name,
                    method: "station",
                    distanceKm: null,
                    flags: [],
                    reason: null,
                    acceptedAt: new Date(),
                    acceptedBy: input.acceptedAtStation.officerName,
                    returnedAt: null,
                    returnedBy: null,
                    returnReason: null,
                  },
                ],
                investigatingOfficerId: input.acceptedAtStation.officerId,
                investigatingOfficerName: input.acceptedAtStation.officerName,
                dueAt: input.acceptedAtStation.workStartDueAt,
              }
            : {}),
          openedBy: input.by.name,
          timeline: [
            {
              at: new Date(),
              event: "opened",
              by: input.by.name,
              byId: input.by.id,
              note: input.note ?? null,
            },
          ],
        },
      ],
      { session },
    );
    return doc!;
  }

  async findById(id: string | Types.ObjectId, session?: ClientSession) {
    if (!Types.ObjectId.isValid(String(id))) return null;
    return this.cases.findById(id, null, { session });
  }

  async attachReport(
    caseId: Types.ObjectId,
    reportId: Types.ObjectId,
    by: { id: string; name: string },
    note: string | null,
    session: ClientSession,
  ) {
    const c = await this.cases.findById(caseId, null, { session });
    if (!c) throw notFound("Case not found.");
    const closed = c.status === "closed";
    await this.cases.updateOne(
      { _id: caseId },
      {
        $addToSet: { reportIds: reportId },
        $push: {
          timeline: {
            at: new Date(),
            // A closed case is not reopened by a merge (docs/02 §6.2).
            event: closed ? "report_attached_closed" : "report_merged",
            by: by.name,
            byId: by.id,
            note,
          },
        },
      },
      { session },
    );
    return c;
  }

  async detachReport(
    caseId: Types.ObjectId,
    reportId: Types.ObjectId,
    by: { id: string; name: string },
    reason: string,
    session: ClientSession,
  ) {
    await this.cases.updateOne(
      { _id: caseId },
      {
        $pull: { reportIds: reportId },
        $push: {
          timeline: {
            at: new Date(),
            event: "report_detached",
            by: by.name,
            byId: by.id,
            note: reason,
          },
        },
      },
      { session },
    );
  }

  /**
   * A station-recorded case that HQ rejects or merges at review (docs/02 §7):
   * the report leaves the case, and the case closes if no report is left and
   * work hasn't started.
   */
  async closeAtReview(
    caseId: Types.ObjectId,
    reportId: Types.ObjectId,
    by: { id: string; name: string },
    reason: string,
    session: ClientSession,
  ) {
    const c = await this.cases.findById(caseId, null, { session });
    if (!c) return;
    const remaining = c.reportIds.filter((r) => !r.equals(reportId));
    const timeline = {
      at: new Date(),
      event: "report_detached",
      by: by.name,
      byId: by.id,
      note: reason,
    };
    if (
      remaining.length === 0 &&
      (c.status === "open" || (c.status === "accepted" && !c.workStartedAt))
    ) {
      caseMachine.assertMove(c.status, "closed");
      await this.cases.updateOne(
        { _id: caseId },
        {
          $set: { status: "closed", closedReason: reason, reportIds: remaining, dueAt: null },
          $push: { timeline: { $each: [timeline, { ...timeline, event: "closed" }] } },
        },
        { session },
      );
    } else {
      await this.cases.updateOne(
        { _id: caseId },
        { $set: { reportIds: remaining }, $push: { timeline } },
        { session },
      );
    }
  }

  /** Cases that may describe the same incident — docs/02 §5. */
  async findMatches(report: {
    vehicleNumber: string | null;
    offenceCodes: string[];
    occurredAt: Date;
    location: { coordinates: number[] } | null;
    caseId: Types.ObjectId | null;
  }): Promise<CaseMatch[]> {
    const window = {
      $gte: new Date(report.occurredAt.getTime() - DAY_MS),
      $lte: new Date(report.occurredAt.getTime() + DAY_MS),
    };
    const found = new Map<
      string,
      {
        doc: Case & { _id: Types.ObjectId };
        reasons: Set<CaseMatch["reasons"][number]>;
        distance: number | null;
      }
    >();

    if (report.vehicleNumber) {
      const samePlate = await this.cases
        .find({ vehicleNumber: report.vehicleNumber, occurredAt: window })
        .limit(10)
        .lean();
      for (const c of samePlate)
        found.set(String(c._id), { doc: c, reasons: new Set(["same_plate"]), distance: null });
    }

    if (report.location && report.offenceCodes.length > 0) {
      const [lng, lat] = report.location.coordinates as [number, number];
      const nearby = await this.cases.aggregate<Case & { _id: Types.ObjectId; distance: number }>([
        {
          $geoNear: {
            key: "location",
            near: { type: "Point", coordinates: [lng, lat] },
            distanceField: "distance",
            maxDistance: NEARBY_METRES,
            spherical: true,
            query: { occurredAt: window, offenceCodes: { $in: report.offenceCodes } },
          },
        },
        { $limit: 10 },
      ]);
      for (const c of nearby) {
        const entry = found.get(String(c._id)) ?? { doc: c, reasons: new Set(), distance: null };
        entry.reasons.add("same_offence_nearby");
        entry.distance = Math.round(c.distance);
        found.set(String(c._id), entry);
      }
    }

    if (report.caseId) found.delete(String(report.caseId));

    return [...found.values()]
      .sort(
        (a, b) =>
          b.reasons.size - a.reasons.size ||
          (a.doc.status === "closed" ? 1 : 0) - (b.doc.status === "closed" ? 1 : 0),
      )
      .map(({ doc, reasons, distance }) => ({
        id: String(doc._id),
        caseNumber: doc.caseNumber,
        status: doc.status,
        priority: doc.priority,
        vehicleNumber: doc.vehicleNumber ?? null,
        offenceCodes: doc.offenceCodes,
        occurredAt: doc.occurredAt.toISOString(),
        address: doc.address,
        distanceMetres: distance,
        reasons: [...reasons],
        reportCount: doc.reportIds.length,
      }));
  }
}
