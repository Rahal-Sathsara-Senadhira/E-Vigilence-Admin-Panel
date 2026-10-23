// The offence schedule — docs/14 D14-8 (versioned, never edited), docs/02 §8.

import { Injectable } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { formatRupees, type OffenceView, type Priority, type PublicOffence } from "@ev/shared";
import type { Connection, Model } from "mongoose";
import type { z } from "zod";
import type { offenceVersionSchema } from "@ev/shared";
import { requireUser, type ActionContext } from "../../common/context";
import { ApiError, conflict, notFound } from "../../common/errors";
import { inTransaction } from "../../common/transaction";
import { AuditService } from "../audit/audit.service";
import { OffenceVersion, PublicOffenceDoc } from "./offence.schema";
import { publishPublicSchedule } from "./schedule.data";

type VersionInput = z.output<typeof offenceVersionSchema>;
type Lean = OffenceVersion & { _id: unknown };

const SEVERITY_ORDER = { severe: 0, moderate: 1, minor: 2 } as const;

function view(o: Lean): OffenceView {
  return {
    code: o.code,
    version: o.version,
    name: o.name,
    legalReference: o.legalReference,
    outcome: o.outcome,
    spotFine: o.spotFine ?? null,
    severity: o.severity,
    demeritPoints: o.demeritPoints ?? null,
    vehicleTypes: o.vehicleTypes ?? [],
    citizenReportable: o.citizenReportable,
    publicName: o.publicName,
    publicDescription: o.publicDescription,
    active: o.active,
    effectiveFrom: o.effectiveFrom.toISOString(),
    source: o.source,
  };
}

@Injectable()
export class OffencesService {
  constructor(
    @InjectModel(OffenceVersion.name) private readonly versions: Model<OffenceVersion>,
    @InjectModel(PublicOffenceDoc.name) private readonly publicCopy: Model<PublicOffenceDoc>,
    @InjectConnection() private readonly conn: Connection,
    private readonly audit: AuditService,
  ) {}

  async list(opts: { includeInactive?: boolean } = {}): Promise<OffenceView[]> {
    const rows = await this.versions
      .find({ current: true, ...(opts.includeInactive ? {} : { active: true }) })
      .lean<Lean[]>();
    return rows
      .sort(
        (a, b) =>
          SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.name.localeCompare(b.name),
      )
      .map(view);
  }

  async history(code: string): Promise<OffenceView[]> {
    const rows = await this.versions.find({ code }).sort({ version: -1 }).lean<Lean[]>();
    if (rows.length === 0) throw notFound("Unknown offence.");
    return rows.map(view);
  }

  /** The version in force at a moment — for notices, which copy the fine of the offence date. */
  async versionAt(code: string, at: Date): Promise<OffenceView | null> {
    const row = await this.versions
      .findOne({ code, effectiveFrom: { $lte: at } })
      .sort({ effectiveFrom: -1 })
      .lean<Lean>();
    return row ? view(row) : null;
  }

  publicList(): Promise<PublicOffence[]> {
    return this.publicCopy
      .find({}, { _id: 0, code: 1, name: 1, description: 1, vehicleTypes: 1 })
      .sort({ sortOrder: 1 })
      .lean<PublicOffence[]>();
  }

  /**
   * Checks that every code exists in the current schedule and is active.
   * Throws a 400 naming the codes that aren't. Returns the current versions.
   */
  async requireActive(codes: string[]): Promise<OffenceView[]> {
    const unique = [...new Set(codes)];
    const rows = await this.versions
      .find({ code: { $in: unique }, current: true, active: true })
      .lean<Lean[]>();
    const found = new Set(rows.map((r) => r.code));
    const unknown = unique.filter((c) => !found.has(c));
    if (unknown.length > 0) {
      throw new ApiError(400, "validation", "Check the highlighted fields.", {
        fields: { offenceCodes: `Not in the offence schedule: ${unknown.join(", ")}` },
      });
    }
    return rows.map(view);
  }

  /** docs/02 §8: severe offences suggest P1, everything else P2. P3 is HQ's call. */
  suggestPriority(offences: Pick<OffenceView, "severity">[], someoneHurt = false): Priority {
    return someoneHurt || offences.some((o) => o.severity === "severe") ? "P1" : "P2";
  }

  async create(ctx: ActionContext, code: string, input: VersionInput): Promise<OffenceView> {
    if (await this.versions.exists({ code }))
      throw conflict("code_taken", `Offence ${code} already exists.`);
    const me = requireUser(ctx);
    const { reason, ...fields } = input;
    await inTransaction(this.conn, async (session) => {
      await this.versions.create(
        [
          {
            code,
            ...fields,
            version: 1,
            effectiveFrom: new Date(),
            effectiveTo: null,
            current: true,
            source: `Added by ${me.name}`,
            changedBy: me.id,
            reason,
          },
        ],
        { session },
      );
      await this.audit.record(
        ctx,
        {
          action: "offences.created",
          summary: `Added ${code} ${fields.name} (${fields.outcome === "court" ? "court" : formatRupees(fields.spotFine)})`,
          reason,
          target: { type: "offence", id: code, label: fields.name },
        },
        session,
      );
    });
    await publishPublicSchedule(this.conn);
    return (await this.history(code))[0]!;
  }

  /** A change is a new version from now on; the previous version is closed, never edited. */
  async update(ctx: ActionContext, code: string, input: VersionInput): Promise<OffenceView> {
    const me = requireUser(ctx);
    const current = await this.versions.findOne({ code, current: true }).lean<Lean>();
    if (!current) throw notFound("Unknown offence.");
    const { reason, ...fields } = input;

    const changed = (Object.keys(fields) as (keyof typeof fields)[]).filter(
      (k) => JSON.stringify(fields[k]) !== JSON.stringify(current[k as keyof Lean] ?? null),
    );
    if (changed.length === 0) throw new ApiError(400, "no_change", "Nothing to change.");

    const now = new Date();
    await inTransaction(this.conn, async (session) => {
      await this.versions.updateOne(
        { _id: current._id, current: true },
        { $set: { current: false, effectiveTo: now } },
        { session },
      );
      await this.versions.create(
        [
          {
            code,
            ...fields,
            version: current.version + 1,
            effectiveFrom: now,
            effectiveTo: null,
            current: true,
            source: current.source,
            changedBy: me.id,
            reason,
          },
        ],
        { session },
      );
      const fine =
        changed.includes("spotFine") || changed.includes("outcome")
          ? ` — fine ${formatRupees(current.spotFine)} → ${formatRupees(fields.spotFine)}`
          : "";
      await this.audit.record(
        ctx,
        {
          action: "offences.updated",
          summary: `${code} version ${current.version + 1}: changed ${changed.join(", ")}${fine}`,
          reason,
          target: { type: "offence", id: code, label: fields.name },
        },
        session,
      );
    });
    await publishPublicSchedule(this.conn);
    return (await this.history(code))[0]!;
  }
}
