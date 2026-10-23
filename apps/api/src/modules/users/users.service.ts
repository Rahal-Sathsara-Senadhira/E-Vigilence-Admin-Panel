// Staff accounts — docs/01-roles-and-permissions.md §5 (S5, S6) and §7.

import { Injectable } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import {
  ROLE_LABELS,
  canManageRole,
  createUserSchema,
  isStationRole,
  mask,
  changeRoleSchema,
  listUsersQuerySchema,
  type Paged,
  type StaffRole,
  type StaffUserView,
  updateUserSchema,
} from "@ev/shared";
import { Types, type ClientSession, type Connection, type QueryFilter, type Model } from "mongoose";
import type { z } from "zod";
import { requireUser, type ActionContext } from "../../common/context";
import { badRequest, conflict, forbidden, notFound } from "../../common/errors";
import { inTransaction } from "../../common/transaction";
import { AuditService } from "../audit/audit.service";
import { CryptoService } from "../auth/crypto.service";
import { SessionsService } from "../auth/sessions.service";
import { StationsService } from "../stations/stations.service";
import { StaffUser, type StaffUserDocument } from "./user.schema";

type CreateUser = z.output<typeof createUserSchema>;
type Lean = StaffUser & { _id: Types.ObjectId };

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(StaffUser.name) private readonly users: Model<StaffUser>,
    @InjectConnection() private readonly conn: Connection,
    private readonly stations: StationsService,
    private readonly crypto: CryptoService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
  ) {}

  // ── Read ─────────────────────────────────────────────────────────────

  async list(ctx: ActionContext, query: z.output<typeof listUsersQuerySchema>) {
    const filter: QueryFilter<StaffUser> = { staff: true };
    if (ctx.scope === "station") filter.stationId = this.oid(requireUser(ctx).stationId);
    else if (query.stationId) filter.stationId = this.oid(query.stationId);
    if (query.role) filter.role = query.role;
    if (query.active) filter.active = query.active === "true";
    if (query.q) {
      const rx = { $regex: query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      filter.$or = [{ name: rx }, { email: rx }];
    }

    const page = query.page;
    const pageSize = query.pageSize;
    const [rows, total] = await Promise.all([
      this.users
        .find(filter, null, {
          sort: { active: -1, name: 1 },
          skip: (page - 1) * pageSize,
          limit: pageSize,
        })
        .lean<Lean[]>(),
      this.users.countDocuments(filter),
    ]);
    return { items: await this.views(rows), total, page, pageSize } satisfies Paged<StaffUserView>;
  }

  async get(ctx: ActionContext, id: string): Promise<StaffUserView> {
    const user = await this.findStaff(id);
    if (ctx.scope === "station" && String(user.stationId) !== requireUser(ctx).stationId)
      throw notFound("Account not found.");
    const [view] = await this.views([user.toObject() as Lean]);
    return view!;
  }

  // ── Create ───────────────────────────────────────────────────────────

  async create(ctx: ActionContext, input: CreateUser) {
    const actor = requireUser(ctx);
    if (!canManageRole(actor.role, input.role)) {
      throw forbidden(`You can't create a ${ROLE_LABELS[input.role]} account.`);
    }
    let stationId = isStationRole(input.role) ? (input.stationId ?? null) : null;
    if (actor.role === "station_oic") {
      if (stationId && stationId !== actor.stationId)
        throw forbidden("You can only add officers to your own station.");
      stationId = actor.stationId;
    }
    if (stationId && !(await this.stations.findActive(stationId)))
      throw badRequest("station_inactive", "Choose an active station.");

    const temporaryPassword = this.crypto.temporaryPassword();
    const passwordHash = await this.crypto.hashPassword(temporaryPassword);

    const created = await this.uniqueGuard(() =>
      inTransaction(this.conn, async (session) => {
        if (input.role === "station_oic")
          await this.demoteCurrentOic(ctx, stationId!, null, session);
        const [doc] = await this.users.create(
          [
            {
              staff: true,
              name: input.name,
              email: input.email,
              nic: input.nic,
              phone: input.phone ?? null,
              role: input.role,
              stationId: stationId ? new Types.ObjectId(stationId) : null,
              passwordHash,
              mustChangePassword: true,
              createdBy: actor.id,
            },
          ],
          { session },
        );
        await this.audit.record(
          ctx,
          {
            action: "user.created",
            summary: `Created ${ROLE_LABELS[input.role]} account${stationId ? ` at ${await this.stations.nameOf(stationId)}` : ""}`,
            target: this.target(doc!),
          },
          session,
        );
        return doc!;
      }),
    );

    const [view] = await this.views([created.toObject() as Lean]);
    // Shown once, to the person who created the account; only its hash is stored.
    return { user: view!, temporaryPassword };
  }

  // ── Update ───────────────────────────────────────────────────────────

  async update(ctx: ActionContext, id: string, input: z.output<typeof updateUserSchema>) {
    const target = await this.manageable(ctx, id);
    const changes: string[] = [];
    if (input.name !== undefined && input.name !== target.name) changes.push("name");
    if (input.email !== undefined && input.email !== target.email) changes.push("email");
    if (input.phone !== undefined && input.phone !== target.phone) changes.push("phone");
    if (changes.length === 0) return this.get(ctx, id);

    await this.uniqueGuard(() =>
      inTransaction(this.conn, async (session) => {
        await this.users.updateOne(
          { _id: target._id },
          {
            $set: {
              ...(input.name !== undefined ? { name: input.name } : {}),
              ...(input.email !== undefined ? { email: input.email } : {}),
              ...(input.phone !== undefined ? { phone: input.phone } : {}),
            },
          },
          { session },
        );
        await this.audit.record(
          ctx,
          {
            action: "user.updated",
            summary: `Updated ${changes.join(", ")}`,
            target: this.target(target),
          },
          session,
        );
      }),
    );
    return this.get(ctx, id);
  }

  /** Role or station change — HQ/dev only, with a reason (docs/01 §7 "Appoint OIC", "Transfer station"). */
  async changeRole(ctx: ActionContext, id: string, input: z.output<typeof changeRoleSchema>) {
    const actor = requireUser(ctx);
    const target = await this.manageable(ctx, id);
    if (!canManageRole(actor.role, input.role))
      throw forbidden(`You can't give an account the ${ROLE_LABELS[input.role]} role.`);

    const stationId = isStationRole(input.role) ? (input.stationId ?? null) : null;
    if (stationId && !(await this.stations.findActive(stationId)))
      throw badRequest("station_inactive", "Choose an active station.");

    const sameRole = target.role === input.role;
    const sameStation = String(target.stationId ?? "") === String(stationId ?? "");
    if (sameRole && sameStation) throw badRequest("no_change", "Nothing to change.");

    if (target.active && !sameRole) await this.assertNotLastAdmin(target.role, String(target._id));

    const fromStation = await this.stations.nameOf(
      target.stationId ? String(target.stationId) : null,
    );
    const toStation = await this.stations.nameOf(stationId);

    await inTransaction(this.conn, async (session) => {
      if (input.role === "station_oic" && target.active) {
        await this.demoteCurrentOic(ctx, stationId!, String(target._id), session);
      }
      await this.users.updateOne(
        { _id: target._id },
        { $set: { role: input.role, stationId: stationId ? new Types.ObjectId(stationId) : null } },
        { session },
      );
      await this.sessions.revokeAllForUser(String(target._id), "role_changed", session);
      if (!sameStation || (input.role !== "station_officer" && input.role !== "station_oic")) {
        await this.releaseCases(
          ctx,
          String(target._id),
          "Investigating officer transferred",
          session,
        );
      }
      await this.audit.record(
        ctx,
        {
          action: "user.role_changed",
          summary: describeChange(target.role, input.role, fromStation, toStation),
          reason: input.reason,
          target: this.target(target),
        },
        session,
      );
    });
    // Phase 2: open cases of a transferred officer go back to the OIC (docs/01 §7).
    return this.get(ctx, id);
  }

  async deactivate(ctx: ActionContext, id: string, reason: string) {
    const target = await this.manageable(ctx, id);
    if (!target.active)
      throw badRequest("already_inactive", "This account is already deactivated.");
    await this.assertNotLastAdmin(target.role, String(target._id));

    await inTransaction(this.conn, async (session) => {
      await this.users.updateOne(
        { _id: target._id },
        { $set: { active: false, deactivatedAt: new Date(), deactivationReason: reason } },
        { session },
      );
      await this.sessions.revokeAllForUser(String(target._id), "deactivated", session);
      await this.releaseCases(
        ctx,
        String(target._id),
        "Investigating officer deactivated",
        session,
      );
      await this.audit.record(
        ctx,
        {
          action: "user.deactivated",
          summary: "Account deactivated",
          reason,
          target: this.target(target),
        },
        session,
      );
    });
    return this.get(ctx, id);
  }

  async reactivate(ctx: ActionContext, id: string, reason: string) {
    const target = await this.manageable(ctx, id);
    if (target.active) throw badRequest("already_active", "This account is already active.");
    if (target.stationId) {
      if (!(await this.stations.findActive(String(target.stationId)))) {
        throw badRequest(
          "station_inactive",
          "The account's station is no longer active. Transfer it first.",
        );
      }
      if (target.role === "station_oic" && (await this.activeOicOf(String(target.stationId)))) {
        throw conflict(
          "station_has_oic",
          "This station already has an active OIC. Reactivate as an officer, or appoint this person OIC afterwards.",
        );
      }
    }
    await inTransaction(this.conn, async (session) => {
      await this.users.updateOne(
        { _id: target._id },
        {
          $set: {
            active: true,
            deactivatedAt: null,
            deactivationReason: null,
            failedLogins: 0,
            lockedUntil: null,
          },
        },
        { session },
      );
      await this.audit.record(
        ctx,
        {
          action: "user.reactivated",
          summary: "Account reactivated",
          reason,
          target: this.target(target),
        },
        session,
      );
    });
    return this.get(ctx, id);
  }

  /** New temporary password; the user must change it at next sign-in. */
  async resetPassword(ctx: ActionContext, id: string) {
    const target = await this.manageable(ctx, id);
    const temporaryPassword = this.crypto.temporaryPassword();
    const passwordHash = await this.crypto.hashPassword(temporaryPassword);
    await inTransaction(this.conn, async (session) => {
      await this.users.updateOne(
        { _id: target._id },
        { $set: { passwordHash, mustChangePassword: true, failedLogins: 0, lockedUntil: null } },
        { session },
      );
      await this.sessions.revokeAllForUser(String(target._id), "password_reset", session);
      await this.audit.record(
        ctx,
        {
          action: "user.password_reset",
          summary: "Temporary password issued",
          target: this.target(target),
        },
        session,
      );
    });
    return { temporaryPassword };
  }

  /** Clears two-step sign-in, e.g. after a lost phone. HQ/dev only, with a reason. */
  async resetMfa(ctx: ActionContext, id: string, reason: string) {
    const target = await this.manageable(ctx, id);
    await inTransaction(this.conn, async (session) => {
      await this.users.updateOne(
        { _id: target._id },
        {
          $set: {
            mfa: {
              enabled: false,
              secretEnc: null,
              pendingSecretEnc: null,
              lastTimeStep: null,
              enabledAt: null,
            },
          },
        },
        { session },
      );
      await this.sessions.revokeAllForUser(String(target._id), "mfa_reset", session);
      await this.audit.record(
        ctx,
        {
          action: "user.mfa_reset",
          summary: "Two-step sign-in reset",
          reason,
          target: this.target(target),
        },
        session,
      );
    });
    return this.get(ctx, id);
  }

  // ── Rules ────────────────────────────────────────────────────────────

  /**
   * Loads an account the actor may manage: S5 (not themselves), the role
   * rule (only dev manages dev), and an OIC only their own station's officers.
   */
  private async manageable(ctx: ActionContext, id: string): Promise<StaffUserDocument> {
    const actor = requireUser(ctx);
    const target = await this.findStaff(id);
    if (String(target._id) === actor.id) {
      throw forbidden(
        "You can't change your own account here. Ask HQ or another administrator.",
        "self_administration",
      );
    }
    if (actor.role === "station_oic" && String(target.stationId) !== actor.stationId)
      throw notFound("Account not found.");
    if (!canManageRole(actor.role, target.role))
      throw forbidden(`You can't manage ${ROLE_LABELS[target.role]} accounts.`);
    return target;
  }

  /**
   * docs/03 §6, 01 §7: a transferred or deactivated officer's open cases go
   * back to the OIC's queue as "needs an investigating officer".
   */
  private async releaseCases(
    ctx: ActionContext,
    userId: string,
    why: string,
    session: ClientSession,
  ) {
    const me = requireUser(ctx);
    const res = await this.conn.collection("cases").updateMany(
      { investigatingOfficerId: userId, status: { $in: ["accepted", "investigating"] } },
      {
        $set: { investigatingOfficerId: null, investigatingOfficerName: null },
        $push: {
          timeline: {
            at: new Date(),
            event: "officer_released",
            by: me.name,
            byId: me.id,
            note: why,
          },
        },
      } as never,
      { session },
    );
    if (res.modifiedCount > 0) {
      await this.audit.record(
        ctx,
        {
          action: "case.officer_released",
          summary: `${why}: ${res.modifiedCount} open case(s) back to the OIC's queue`,
          target: { type: "user", id: userId, label: null },
        },
        session,
      );
    }
  }

  /** S6: at least one active HQ and one active dev account at all times. */
  private async assertNotLastAdmin(role: StaffRole, userId: string) {
    if (role !== "hq" && role !== "dev") return;
    const others = await this.users.countDocuments({
      staff: true,
      role,
      active: true,
      _id: { $ne: userId },
    });
    if (others === 0) {
      throw conflict(
        "last_administrator",
        `This is the last active ${ROLE_LABELS[role]} account. Create another one first.`,
      );
    }
  }

  /** One active OIC per station (D01-2): appointing a new one makes the previous an officer. */
  private async demoteCurrentOic(
    ctx: ActionContext,
    stationId: string,
    exceptUserId: string | null,
    session: ClientSession,
  ) {
    const current = await this.users.findOne(
      {
        staff: true,
        role: "station_oic",
        stationId: new Types.ObjectId(stationId),
        active: true,
        ...(exceptUserId ? { _id: { $ne: exceptUserId } } : {}),
      },
      null,
      { session },
    );
    if (!current) return;
    await this.users.updateOne(
      { _id: current._id },
      { $set: { role: "station_officer" } },
      { session },
    );
    await this.sessions.revokeAllForUser(String(current._id), "role_changed", session);
    await this.audit.record(
      ctx,
      {
        action: "user.role_changed",
        summary: "OIC → Traffic officer (new OIC appointed)",
        target: this.target(current),
      },
      session,
    );
  }

  private activeOicOf(stationId: string) {
    return this.users.exists({
      staff: true,
      role: "station_oic",
      stationId: new Types.ObjectId(stationId),
      active: true,
    });
  }

  private async findStaff(id: string) {
    if (!Types.ObjectId.isValid(id)) throw notFound("Account not found.");
    const user = await this.users.findOne({ _id: id, staff: true });
    if (!user) throw notFound("Account not found.");
    return user;
  }

  private async uniqueGuard<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (err) {
      const e = err as { code?: number; keyPattern?: Record<string, unknown> };
      if (e?.code === 11000 && e.keyPattern) {
        if ("email" in e.keyPattern)
          throw conflict("email_taken", "An account with this email already exists.");
        if ("nic" in e.keyPattern)
          throw conflict("nic_taken", "An account with this NIC already exists.");
      }
      throw err;
    }
  }

  private oid(id: string | null | undefined) {
    return id && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
  }

  private target(user: { _id: unknown; email: string }) {
    return { type: "user", id: String(user._id), label: user.email };
  }

  private async views(rows: Lean[]): Promise<StaffUserView[]> {
    const names = await this.stations.namesByIds(
      rows.map((r) => (r.stationId ? String(r.stationId) : "")).filter(Boolean),
    );
    return rows.map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      nicMasked: mask(u.nic, 4),
      phone: u.phone ?? null,
      role: u.role,
      stationId: u.stationId ? String(u.stationId) : null,
      stationName: u.stationId ? (names.get(String(u.stationId)) ?? null) : null,
      active: u.active,
      mfaEnabled: !!u.mfa?.enabled,
      lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
      createdAt: new Date(u.createdAt).toISOString(),
    }));
  }
}

function describeChange(
  fromRole: StaffRole,
  toRole: StaffRole,
  fromStation: string | null,
  toStation: string | null,
) {
  const parts: string[] = [];
  if (fromRole !== toRole) parts.push(`${ROLE_LABELS[fromRole]} → ${ROLE_LABELS[toRole]}`);
  if (fromStation !== toStation)
    parts.push(`station ${fromStation ?? "none"} → ${toStation ?? "none"}`);
  return parts.join("; ");
}
