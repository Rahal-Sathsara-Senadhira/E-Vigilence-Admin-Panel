import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from "@nestjs/common";
import {
  assignOfficerSchema,
  caseEvidenceSchema,
  caseFactsSchema,
  decideSchema,
  dispatchSchema,
  evidenceReviewSchema,
  listCasesQuerySchema,
  mergeCaseSchema,
  noteSchema,
  overrideSchema,
  recommendSchema,
  reopenSchema,
  returnCaseSchema,
  setDriverSchema,
  statementSchema,
  vehicleTraceSchema,
} from "@ev/shared";
import { Types } from "mongoose";
import type { z } from "zod";
import { Ctx, requireUser, type ActionContext } from "../../common/context";
import { badRequest } from "../../common/errors";
import { ZodPipe } from "../../common/zod.pipe";
import { RequirePermission } from "../auth/auth.decorators";
import { EvidenceService } from "../evidence/evidence.service";
import { OffencesService } from "../offences/offences.service";
import { PeopleService } from "../people/people.service";
import { CaseQueryService } from "./case-query.service";
import { CaseWorkflowService } from "./case-workflow.service";

type Out<T extends z.ZodType> = z.output<T>;

@Controller("cases")
export class CasesController {
  constructor(
    private readonly query: CaseQueryService,
    private readonly workflow: CaseWorkflowService,
    private readonly evidence: EvidenceService,
    private readonly offences: OffencesService,
    private readonly people: PeopleService,
  ) {}

  // ── Reading ───────────────────────────────────────────────────────────

  @Get()
  @RequirePermission("cases.view")
  list(
    @Ctx() ctx: ActionContext,
    @Query(new ZodPipe(listCasesQuerySchema)) q: Out<typeof listCasesQuerySchema>,
  ) {
    return this.query.list(ctx, q);
  }

  @Get(":id")
  @RequirePermission("cases.view")
  get(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.query.get(ctx, id);
  }

  @Get(":id/evidence")
  @RequirePermission("cases.view")
  evidenceList(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.evidence.listForCase(ctx, id);
  }

  // ── Dispatch and acceptance (docs/03 §5–6) ────────────────────────────

  @Post(":id/dispatch")
  @HttpCode(200)
  @RequirePermission("cases.dispatch")
  dispatch(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(dispatchSchema)) b: Out<typeof dispatchSchema>,
  ) {
    return this.workflow.dispatch(ctx, id, b);
  }

  @Post(":id/accept")
  @HttpCode(200)
  @RequirePermission("cases.acceptReturn")
  accept(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.workflow.accept(ctx, id);
  }

  @Post(":id/return")
  @HttpCode(200)
  @RequirePermission("cases.acceptReturn")
  returnCase(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(returnCaseSchema)) b: Out<typeof returnCaseSchema>,
  ) {
    return this.workflow.returnToHq(ctx, id, b.reason);
  }

  @Post(":id/officer")
  @HttpCode(200)
  @RequirePermission("cases.assignOfficer")
  assign(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(assignOfficerSchema)) b: Out<typeof assignOfficerSchema>,
  ) {
    return this.workflow.assignOfficer(ctx, id, b.officerId, b.note ?? null);
  }

  // ── Investigation (docs/04 §6) ────────────────────────────────────────

  @Post(":id/notes")
  @HttpCode(200)
  @RequirePermission("cases.investigate")
  note(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(noteSchema)) b: Out<typeof noteSchema>,
  ) {
    const me = requireUser(ctx);
    return this.workflow.work(ctx, id, "case.note_added", async (c) => {
      c.notes.push({ at: new Date(), by: me.name, byId: me.id, text: b.text });
      return "Note added";
    });
  }

  @Put(":id/evidence-review")
  @RequirePermission("cases.investigate")
  review(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(evidenceReviewSchema)) b: Out<typeof evidenceReviewSchema>,
  ) {
    const me = requireUser(ctx);
    return this.workflow.work(ctx, id, "case.evidence_reviewed", async (c) => {
      const { note, ...items } = b;
      c.evidenceReview = { ...items, note: note ?? null, by: me.name, at: new Date() };
      const failed = Object.entries(items)
        .filter(([, ok]) => !ok)
        .map(([k]) => k);
      return failed.length
        ? `Evidence reviewed — concerns: ${failed.join(", ")}`
        : "Evidence reviewed — all checks passed";
    });
  }

  @Post(":id/statements")
  @HttpCode(200)
  @RequirePermission("cases.investigate")
  statement(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(statementSchema)) b: Out<typeof statementSchema>,
  ) {
    const me = requireUser(ctx);
    return this.workflow.work(ctx, id, "case.statement_added", async (c, session) => {
      const evidenceIds = await this.evidence.claimForCase(ctx, b.evidenceIds, c, session);
      c.statements.push({
        at: new Date(),
        by: me.name,
        from: b.from,
        name: b.name,
        takenAt: b.takenAt,
        summary: b.summary,
        evidenceIds,
      });
      return `Statement from the ${b.from} recorded`;
    });
  }

  @Post(":id/evidence")
  @HttpCode(200)
  @RequirePermission("cases.investigate")
  addEvidence(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(caseEvidenceSchema)) b: Out<typeof caseEvidenceSchema>,
  ) {
    return this.workflow.work(ctx, id, "case.evidence_added", async (c, session) => {
      const ids = await this.evidence.claimForCase(ctx, b.evidenceIds, c, session);
      c.evidenceIds.push(...ids);
      return `${ids.length} evidence file(s) added`;
    });
  }

  /** Offences, place, time or vehicle type corrected during investigation, with a note (docs/03 §3). */
  @Patch(":id/facts")
  @RequirePermission("cases.investigate")
  facts(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(caseFactsSchema)) b: Out<typeof caseFactsSchema>,
  ) {
    const me = requireUser(ctx);
    return this.workflow.work(ctx, id, "case.facts_corrected", async (c) => {
      const changed: string[] = [];
      if (b.offenceCodes) {
        await this.offences.requireActive(b.offenceCodes);
        c.offenceCodes = b.offenceCodes;
        changed.push("offences");
      }
      if (b.location) {
        c.location = { type: "Point", coordinates: [b.location.lng, b.location.lat] };
        changed.push("location");
      }
      if (b.address) {
        c.address = b.address;
        changed.push("address");
      }
      if (b.occurredAt) {
        c.occurredAt = b.occurredAt;
        changed.push("time");
      }
      if (b.vehicleType) {
        c.vehicleType = b.vehicleType;
        changed.push("vehicle type");
      }
      if (changed.length === 0) throw badRequest("no_change", "Nothing to change.");
      c.timeline.push({
        at: new Date(),
        event: "facts_corrected",
        by: me.name,
        byId: me.id,
        note: `${changed.join(", ")}: ${b.note}`,
      });
      return `Corrected ${changed.join(", ")}`;
    });
  }

  /** Records the officer's trace: vehicle and owner on the offence date (docs/04 §3, V1–V4). */
  @Post(":id/vehicle-trace")
  @HttpCode(200)
  @RequirePermission("cases.investigate")
  trace(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(vehicleTraceSchema)) b: Out<typeof vehicleTraceSchema>,
  ) {
    const me = requireUser(ctx);
    return this.workflow.work(ctx, id, "case.vehicle_traced", async (c, session) => {
      const { vehicle, owner } = await this.people.trace(ctx, b, session);
      const plateChanged = c.vehicleNumber && c.vehicleNumber !== vehicle.plate;
      c.vehicleId = vehicle._id;
      c.ownerId = owner._id;
      c.vehicleNumber = vehicle.plate;
      c.plateUnknown = false;
      for (const f of vehicle.flags) if (!c.flags.includes(f.flag)) c.flags.push(f.flag);
      c.timeline.push({
        at: new Date(),
        event: "vehicle_traced",
        by: me.name,
        byId: me.id,
        note: `${vehicle.plate} — DMT ref ${b.dmtReference}${plateChanged ? " (plate corrected)" : ""}`,
      });
      return `Vehicle ${vehicle.plate} traced to its registered owner`;
    });
  }

  @Put(":id/driver")
  @RequirePermission("cases.investigate")
  driver(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(setDriverSchema)) b: Out<typeof setDriverSchema>,
  ) {
    return this.workflow.work(ctx, id, "case.driver_set", async (c, session) => {
      if (b.driverId) {
        const p = await this.people.findPerson(b.driverId, session);
        if (!p)
          throw badRequest(
            "person_not_found",
            "Choose the driver from the register, or add them first.",
          );
        c.driverId = new Types.ObjectId(b.driverId);
      } else {
        c.driverId = null;
      }
      c.driverBasis = b.basis;
      return b.driverId ? "Driver identified" : "Driver cleared";
    });
  }

  // ── Outcome (docs/05 §3–4) ────────────────────────────────────────────

  @Post(":id/recommend")
  @HttpCode(200)
  @RequirePermission("cases.recommend")
  recommend(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(recommendSchema)) b: Out<typeof recommendSchema>,
  ) {
    return this.workflow.recommend(ctx, id, b);
  }

  @Post(":id/decide")
  @HttpCode(200)
  @RequirePermission("cases.decide")
  decide(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(decideSchema)) b: Out<typeof decideSchema>,
  ) {
    return this.workflow.decide(ctx, id, b);
  }

  @Post(":id/override")
  @HttpCode(200)
  @RequirePermission("cases.override")
  override(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(overrideSchema)) b: Out<typeof overrideSchema>,
  ) {
    return this.workflow.override(ctx, id, b.reason);
  }

  @Post(":id/reopen")
  @HttpCode(200)
  @RequirePermission("cases.override")
  reopen(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(reopenSchema)) b: Out<typeof reopenSchema>,
  ) {
    return this.workflow.reopen(ctx, id, b.reason);
  }

  @Post(":id/merge")
  @HttpCode(200)
  @RequirePermission("cases.override")
  merge(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(mergeCaseSchema)) b: Out<typeof mergeCaseSchema>,
  ) {
    return this.workflow.merge(ctx, id, b.intoCaseId, b.reason);
  }
}
