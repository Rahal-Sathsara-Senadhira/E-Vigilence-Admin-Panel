// /api/v1/payments (staff) and /api/v1/public/payments (the payer and the
// simulator) — docs/07.

import { Router } from "express";
import { z } from "zod";
import { publicRoute, requirePermission } from "#src/core/access/guards.js";
import { createRateLimiter } from "#src/core/http/rate-limit.js";
import { body, parseOrThrow, query } from "#src/core/http/validate.js";
import { receiveUpload } from "../evidence/index.js";
import { RECEIPT_METHODS } from "./payment.model.js";
import {
  approveRefund,
  getPayment,
  listPayments,
  onlineReceipt,
  receiptScan,
  receiveConfirmation,
  recordReceipt,
  reviewReceipt,
  simulatorOutcome,
  simulatorSession,
  startOnline,
} from "./payments.service.js";
import { canonical } from "./simulator.js";

const listSchema = z.object({
  view: z.enum(["all", "receipts_to_review", "refunds_due", "refunded", "flagged"]).default("all"),
  q: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const receiptSchema = z.object({
  method: z.enum(RECEIPT_METHODS, { error: "Choose where it was paid." }),
  receiptNumber: z.string().trim().min(3, "Enter the receipt number.").max(60),
  amount: z.coerce.number().int().positive("Enter the amount paid."),
  paidOn: z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now() + 60_000, "It can't be paid in the future."),
  payerName: z.string().trim().max(150).optional(),
});
const reason = z.string().trim().min(10, "Give the reason (10 characters or more).").max(1000);
const reviewSchema = z.discriminatedUnion("result", [
  z.object({ result: z.literal("confirmed"), reason: z.string().trim().max(1000).optional() }),
  z.object({ result: z.literal("reversed"), reason }),
]);
const startSchema = z.object({
  noticeNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^PN-\d{4}-\d{6}$/, "Enter the notice number, like PN-2026-000123."),
  idNumber: z.string().trim().min(5, "Enter the NIC or business registration number.").max(30),
});
const outcomeSchema = z.object({
  method: z.enum(["card", "wallet"]),
  outcome: z.enum(["success", "declined", "cancel", "delay"]),
});

/** The simulator's pages, per address. */
export const simulatorLimiter = createRateLimiter({
  max: 60,
  windowMs: 10 * 60_000,
  message: "Too many requests. Try again in a few minutes.",
});

/** @param {import("express").Request} req */
const ctx = (req) => ({
  ip: req.ip ?? null,
  userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
});
/** @param {import("express").Request} req */
const actor = (req) => /** @type {NonNullable<typeof req.auth>} */ (req.auth);
/** @param {import("express").Request} req */
const idOf = (req) => String(req.params.id);

/** @param {import("#src/core/storage.js").Storage} storage */
export function paymentsRoutes(storage) {
  const router = Router();
  const view = requirePermission("payments.view");
  router.get("/", view, query(listSchema), async (req, res) => {
    res.json(await listPayments(actor(req), req.validQuery));
  });
  router.get("/:id", view, async (req, res) => {
    res.json(await getPayment(actor(req), idOf(req)));
  });
  router.get("/:id/scan", view, async (req, res) => {
    const { file, mime } = await receiptScan(actor(req), idOf(req), storage);
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "private, no-store");
    if (file.size) res.setHeader("Content-Length", String(file.size));
    file.stream.pipe(res);
  });
  // A receipt and its scan in one form (docs/07 §6).
  router.post("/receipts/:id", requirePermission("payments.recordReceipt"), async (req, res) => {
    const scan = await receiveUpload(req);
    let input;
    try {
      input = parseOrThrow(receiptSchema, scan.fields ?? {});
    } catch (err) {
      await scan.cleanUp();
      throw err;
    }
    res
      .status(201)
      .json(await recordReceipt(actor(req), idOf(req), input, scan, storage, ctx(req)));
  });
  router.post(
    "/:id/review",
    requirePermission("payments.reviewReceipt"),
    body(reviewSchema),
    async (req, res) => {
      res.json(await reviewReceipt(actor(req), idOf(req), req.body, ctx(req)));
    },
  );
  router.post("/:id/refund", requirePermission("payments.approveRefund"), async (req, res) => {
    res.json(await approveRefund(actor(req), idOf(req), ctx(req)));
  });
  return router;
}

export function publicPaymentsRoutes() {
  const router = Router();
  router.post("/start", publicRoute(), body(startSchema), async (req, res) => {
    res.status(201).json(await startOnline(req.body, req.ip ?? "unknown"));
  });
  router.get("/sim/:session", publicRoute(), simulatorLimiter.middleware, async (req, res) => {
    res.json(await simulatorSession(String(req.params.session)));
  });
  router.post(
    "/sim/:session/outcome",
    publicRoute(),
    simulatorLimiter.middleware,
    body(outcomeSchema),
    async (req, res) => {
      res.json(await simulatorOutcome(String(req.params.session), req.body));
    },
  );
  router.get("/receipt/:session", publicRoute(), simulatorLimiter.middleware, async (req, res) => {
    res.json(await onlineReceipt(String(req.params.session)));
  });
  // A provider's server-to-server confirmation (docs/07 P5): the signature
  // decides, not who sends it.
  router.post("/confirm", publicRoute(), async (req, res) => {
    await receiveConfirmation(canonical(req.body ?? {}), String(req.get("x-signature") ?? ""));
    res.json({ ok: true });
  });
  return router;
}
