// Vehicle and person registers — docs/04.
//
// Person records are personal data: HQ and the station handling a case that
// involves the person may see them, and every view is logged (§9, D04-7).

import { Injectable } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import {
  OWNER_RECHECK_MONTHS,
  mask,
  personSchema,
  vehicleTraceSchema,
  type PersonSummary,
  type PersonView,
  type VehicleView,
} from "@ev/shared";
import { Types, type ClientSession, type Connection, type Model } from "mongoose";
import type { z } from "zod";
import { requireUser, type ActionContext } from "../../common/context";
import { badRequest, conflict, forbidden, notFound } from "../../common/errors";
import { AuditService } from "../audit/audit.service";
import { Person, Vehicle, type PersonDocument } from "./people.schema";

type PersonIn = z.output<typeof personSchema>;
type TraceIn = z.output<typeof vehicleTraceSchema>;
type LeanPerson = Person & { _id: Types.ObjectId };
type LeanVehicle = Vehicle & { _id: Types.ObjectId };

const ENFORCEMENT = ["penalty_notice", "court", "warning"];
const YEAR_MS = 365 * 86_400_000;

@Injectable()
export class PeopleService {
  constructor(
    @InjectModel(Person.name) private readonly persons: Model<Person>,
    @InjectModel(Vehicle.name) private readonly vehicles: Model<Vehicle>,
    @InjectConnection() private readonly conn: Connection,
    private readonly audit: AuditService,
  ) {}

  // ── Persons ───────────────────────────────────────────────────────────

  /** P1: before creating a person, find matches by NIC, licence or registration number. */
  async findMatches(input: {
    nic?: string;
    licenceNumber?: string;
    businessRegNo?: string;
    q?: string;
  }) {
    const or: Record<string, unknown>[] = [];
    if (input.nic) or.push({ nic: input.nic.replace(/\s+/g, "").toUpperCase() });
    if (input.licenceNumber) or.push({ licenceNumber: input.licenceNumber.trim().toUpperCase() });
    if (input.businessRegNo) or.push({ businessRegNo: input.businessRegNo.trim() });
    if (input.q && input.q.length >= 3)
      or.push({ name: { $regex: input.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } });
    if (or.length === 0) return [];
    const rows = await this.persons
      .find({ $or: or, mergedInto: null })
      .limit(10)
      .lean<LeanPerson[]>();
    return rows.map((p) => this.summary(p));
  }

  async create(ctx: ActionContext, input: PersonIn): Promise<PersonSummary> {
    const me = requireUser(ctx);
    try {
      const doc = await this.persons.create({
        type: input.type,
        name: input.name,
        nic: input.type === "individual" ? (input.nic ?? null) : null,
        businessRegNo: input.type === "organisation" ? (input.businessRegNo ?? null) : null,
        licenceNumber: input.type === "individual" ? (input.licenceNumber ?? null) : null,
        address: input.address ?? null,
        phone: input.phone ?? null,
        createdBy: me.id,
      });
      await this.audit.record(ctx, {
        action: "person.created",
        summary: `${input.type === "organisation" ? "Organisation" : "Person"} added to the register`,
        target: { type: "person", id: String(doc._id), label: null },
      });
      return this.summary(doc.toObject() as LeanPerson);
    } catch (err) {
      const e = err as { code?: number; keyPattern?: Record<string, unknown> };
      if (e.code === 11000 && e.keyPattern) {
        const field = Object.keys(e.keyPattern)[0];
        throw conflict(
          "person_exists",
          `A person with this ${field === "nic" ? "NIC" : field === "licenceNumber" ? "licence number" : "registration number"} is already in the register. Use the existing record.`,
        );
      }
      throw err;
    }
  }

  async updateAddress(ctx: ActionContext, id: string, address: string, phone?: string | null) {
    await this.assertCanView(ctx, id);
    const res = await this.persons.updateOne(
      { _id: this.oid(id) },
      { $set: { address, ...(phone !== undefined ? { phone } : {}) } },
    );
    if (!res.matchedCount) throw notFound("Person not found.");
    await this.audit.record(ctx, {
      action: "person.updated",
      summary: "Address or phone updated",
      target: { type: "person", id, label: null },
    });
  }

  /** A person's record, with their cases — logged on every view (D04-7). */
  async get(ctx: ActionContext, id: string): Promise<PersonView> {
    await this.assertCanView(ctx, id);
    const p = await this.persons.findById(this.oid(id)).lean<LeanPerson>();
    if (!p) throw notFound("Person not found.");
    await this.audit.record(ctx, {
      action: "person.viewed",
      summary: "Person record viewed",
      target: { type: "person", id, label: null },
    });

    const cases = await this.conn
      .collection("cases")
      .find(
        { $or: [{ ownerId: p._id }, { driverId: p._id }] },
        {
          projection: {
            caseNumber: 1,
            status: 1,
            occurredAt: 1,
            ownerId: 1,
            driverId: 1,
            "decision.outcome": 1,
            "decision.at": 1,
          },
        },
      )
      .sort({ occurredAt: -1 })
      .limit(50)
      .toArray();
    const since = Date.now() - YEAR_MS;
    return {
      id: String(p._id),
      type: p.type,
      name: p.name,
      nic: p.nic,
      businessRegNo: p.businessRegNo,
      licenceNumber: p.licenceNumber,
      address: p.address,
      phone: p.phone,
      createdAt: p.createdAt.toISOString(),
      cases: cases.map((c) => ({
        id: String(c._id),
        caseNumber: c.caseNumber,
        role: c.driverId && String(c.driverId) === id ? "driver" : "owner",
        status: c.status,
        occurredAt: c.occurredAt.toISOString(),
      })),
      enforcementLast12Months: cases.filter(
        (c) => ENFORCEMENT.includes(c.decision?.outcome) && c.decision.at.getTime() >= since,
      ).length,
    };
  }

  async summaryOf(id: Types.ObjectId | null): Promise<PersonSummary | null> {
    if (!id) return null;
    const p = await this.persons.findById(id).lean<LeanPerson>();
    return p ? this.summary(p) : null;
  }

  async findPerson(id: string | Types.ObjectId, session?: ClientSession) {
    return this.persons.findById(id, null, { session });
  }

  // ── Vehicles ──────────────────────────────────────────────────────────

  /**
   * Records an officer's trace (V1–V4): creates the vehicle the first time;
   * adds the owner to the history (never overwrites — V3).
   */
  async trace(ctx: ActionContext, input: TraceIn, session: ClientSession) {
    const me = requireUser(ctx);
    const owner = await this.persons.findById(this.oid(input.ownerId), null, { session });
    if (!owner)
      throw badRequest("owner_not_found", "Choose the owner from the register, or add them first.");
    const now = new Date();
    let vehicle = await this.vehicles.findOne({ plate: input.plate }, null, { session });
    if (!vehicle) {
      const created = await this.vehicles.create(
        [
          {
            plate: input.plate,
            type: input.type,
            make: input.make ?? null,
            vehicleModel: input.model ?? null,
            colour: input.colour ?? null,
          },
        ],
        { session },
      );
      vehicle = created[0]!;
    } else {
      vehicle.type = input.type;
      if (input.make) vehicle.make = input.make;
      if (input.model) vehicle.vehicleModel = input.model;
      if (input.colour) vehicle.colour = input.colour;
    }
    const latest = vehicle!.ownership.at(-1);
    if (latest && !latest.to && !latest.personId.equals(owner._id))
      latest.to = input.ownedFrom ?? now;
    vehicle!.ownership.push({
      personId: owner._id,
      from: input.ownedFrom ?? null,
      to: null,
      dmtReference: input.dmtReference,
      recordedBy: me.name,
      recordedById: me.id,
      recordedAt: now,
    });
    await vehicle!.save({ session });
    return { vehicle: vehicle!, owner };
  }

  async getVehicle(ctx: ActionContext, id: string): Promise<VehicleView> {
    const v = await this.vehicles.findById(this.oid(id)).lean<LeanVehicle>();
    if (!v) throw notFound("Vehicle not found.");
    return this.vehicleView(v);
  }

  async findVehicleByPlate(plate: string) {
    const v = await this.vehicles.findOne({ plate }).lean<LeanVehicle>();
    return v ? this.vehicleView(v) : null;
  }

  async vehicleSummary(id: Types.ObjectId | null) {
    if (!id) return null;
    const v = await this.vehicles.findById(id).lean<LeanVehicle>();
    if (!v) return null;
    return {
      id: String(v._id),
      plate: v.plate,
      type: v.type,
      make: v.make,
      model: v.vehicleModel,
      colour: v.colour,
      flags: v.flags.map((f) => f.flag),
    };
  }

  async setVehicleFlag(
    ctx: ActionContext,
    id: string,
    input: {
      flag: Vehicle["flags"][number]["flag"];
      on: boolean;
      reference?: string;
      reason: string;
    },
  ) {
    const me = requireUser(ctx);
    const v = await this.vehicles.findById(this.oid(id));
    if (!v) throw notFound("Vehicle not found.");
    v.flags = v.flags.filter((f) => f.flag !== input.flag);
    if (input.on)
      v.flags.push({
        flag: input.flag,
        reference: input.reference ?? null,
        reason: input.reason,
        by: me.name,
        at: new Date(),
      });
    await v.save();
    await this.audit.record(ctx, {
      action: input.on ? "vehicle.flagged" : "vehicle.unflagged",
      summary: `${input.flag.replace(/_/g, " ")} ${input.on ? "set" : "cleared"} on ${v.plate}`,
      reason: input.reason,
      target: { type: "vehicle", id, label: v.plate },
    });
    return this.getVehicle(ctx, id);
  }

  /** Enforcement outcomes in the last 12 months for the banner (D04-4). */
  async repeatCounts(
    vehicleId: Types.ObjectId | null,
    personId: Types.ObjectId | null,
    exceptCaseId: Types.ObjectId,
  ) {
    const since = new Date(Date.now() - YEAR_MS);
    const base = {
      _id: { $ne: exceptCaseId },
      "decision.outcome": { $in: ENFORCEMENT },
      "decision.at": { $gte: since },
    };
    const cases = this.conn.collection("cases");
    const [vehicle, person] = await Promise.all([
      vehicleId ? cases.countDocuments({ ...base, vehicleId }) : 0,
      personId
        ? cases.countDocuments({ ...base, $or: [{ ownerId: personId }, { driverId: personId }] })
        : 0,
    ]);
    return { vehicle, person };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /** HQ always; station staff only for persons on a case at their station (D04-7). */
  private async assertCanView(ctx: ActionContext, personId: string) {
    const me = requireUser(ctx);
    if (ctx.scope === "all") return;
    const pid = this.oid(personId);
    const query: Record<string, unknown> = {
      $or: [{ ownerId: pid }, { driverId: pid }],
      stationId: new Types.ObjectId(me.stationId!),
    };
    if (ctx.scope === "assigned") query.investigatingOfficerId = me.id;
    const ok = await this.conn.collection("cases").countDocuments(query, { limit: 1 });
    if (!ok) throw forbidden("You can see people only on your station's cases.");
  }

  private async vehicleView(v: LeanVehicle): Promise<VehicleView> {
    const ids = v.ownership.map((o) => o.personId);
    const people = new Map(
      (await this.persons.find({ _id: { $in: ids } }, { name: 1 }).lean<LeanPerson[]>()).map(
        (p) => [String(p._id), p.name],
      ),
    );
    const cases = await this.conn
      .collection("cases")
      .find(
        { vehicleId: v._id },
        {
          projection: {
            caseNumber: 1,
            status: 1,
            occurredAt: 1,
            "decision.outcome": 1,
            "decision.at": 1,
          },
        },
      )
      .sort({ occurredAt: -1 })
      .limit(50)
      .toArray();
    const current = v.ownership.at(-1);
    const recheckMs = OWNER_RECHECK_MONTHS * 30 * 86_400_000;
    const since = Date.now() - YEAR_MS;
    return {
      id: String(v._id),
      plate: v.plate,
      type: v.type,
      make: v.make,
      model: v.vehicleModel,
      colour: v.colour,
      flags: v.flags.map((f) => f.flag),
      ownership: v.ownership.map((o) => ({
        personId: String(o.personId),
        personName: people.get(String(o.personId)) ?? "Unknown",
        from: o.from ? o.from.toISOString() : null,
        to: o.to ? o.to.toISOString() : null,
        dmtReference: o.dmtReference,
        recordedBy: o.recordedBy,
        recordedAt: o.recordedAt.toISOString(),
      })),
      currentOwner:
        current && !current.to
          ? {
              id: String(current.personId),
              name: people.get(String(current.personId)) ?? "Unknown",
              recordedAt: current.recordedAt.toISOString(),
              needsRecheck: Date.now() - current.recordedAt.getTime() > recheckMs,
            }
          : null,
      cases: cases.map((c) => ({
        id: String(c._id),
        caseNumber: c.caseNumber,
        status: c.status,
        occurredAt: c.occurredAt.toISOString(),
      })),
      enforcementLast12Months: cases.filter(
        (c) => ENFORCEMENT.includes(c.decision?.outcome) && c.decision.at.getTime() >= since,
      ).length,
    };
  }

  summary(p: LeanPerson | PersonDocument): PersonSummary {
    return {
      id: String(p._id),
      type: p.type,
      name: p.name,
      nicMasked: p.nic ? mask(p.nic, 4) : p.businessRegNo ? mask(p.businessRegNo, 4) : null,
      hasAddress: !!p.address,
    };
  }

  private oid(id: string) {
    if (!Types.ObjectId.isValid(id)) throw notFound("Not found.");
    return new Types.ObjectId(id);
  }
}
