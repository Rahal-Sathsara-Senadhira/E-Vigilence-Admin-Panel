// /api/v1/notices — penalty notices and warning letters (docs/05).

import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "#src/core/access/guards.js";
import { body, query } from "#src/core/http/validate.js";
import {
  confirmCourt,
  getNotice,
  listNotices,
  listOutbox,
  markPosted,
  markServiceFailed,
  noticeDocument,
  reserveNotice,
  withdrawNotice,
} from "./notices.service.js";
import {
  DISPUTE_GROUNDS,
  publicLookup,
  publicRespond,
  recordResponse,
  reviewDispute,
  reviewNomination,
} from "./responses.js";
import { createRateLimiter } from "#src/core/http/rate-limit.js";
import { publicRoute } from "#src/core/access/guards.js";

const listSchema = z.object({
  view: z
    .enum([
      "to_post",
      "service_failed",
      "running",
      "nominations",
      "disputes",
      "overdue",
      "court_proposed",
      "closed",
      "all",
    ])
    .default("all"),
  kind: z.enum(["penalty", "warning"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const outboxSchema = z.object({
  status: z.enum(["queued", "sent", "cancelled"]).optional(),
  channel: z.enum(["post", "sms"]).optional(),
});
const reason = z.string().trim().min(10, "Give the reason (10 characters or more).").max(1000);
const postedSchema = z.object({
  postedAt: z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now() + 60_000, "It can't be posted in the future.")
    .optional(),
});
const failedSchema = z.object({
  note: z.string().trim().min(5, "Say what happened (returned mail, unknown address…).").max(1000),
});
const reserveSchema = z.object({
  address: z.string().trim().min(8, "Enter the full new address.").max(300),
  reason,
});

const driverSchema = z.object({
  name: z.string().trim().min(2, "Enter the driver's name.").max(150),
  nic: z.string().trim().max(20).optional(),
  licenceNumber: z.string().trim().max(30).optional(),
  address: z.string().trim().min(8, "Enter the driver's full address.").max(300),
  phone: z.string().trim().max(30).optional(),
});
const nominationFields = {
  driver: driverSchema,
  statement: z.string().trim().max(2000).optional(),
};
const disputeFields = {
  grounds: z.enum(DISPUTE_GROUNDS, { error: "Choose the grounds." }),
  explanation: z.string().trim().min(10, "Explain your reasons (10 characters or more).").max(4000),
};
const responseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("nomination"), ...nominationFields }),
  z.object({ type: z.literal("dispute"), ...disputeFields }),
]);
const nominationReviewSchema = z.discriminatedUnion("result", [
  z.object({
    result: z.literal("accepted"),
    personId: z.string().trim().optional(),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({ result: z.literal("rejected"), reason }),
]);
const disputeReviewSchema = z.object({ result: z.enum(["upheld", "rejected"]), reasons: reason });
const identify = {
  noticeNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^PN-\d{4}-\d{6}$/, "Enter the notice number, like PN-2026-000123."),
  plate: z.string().trim().min(3, "Enter the vehicle number.").max(20),
};
const declaration = z.literal(true, { error: "Confirm the information is true." });

/** Online look-ups and responses, per address (docs/05; no sign-in). */
export const publicLookupLimiter = createRateLimiter({
  max: 20,
  windowMs: 15 * 60_000,
  message: "Too many look-ups. Try again in 15 minutes.",
});
export const publicRespondLimiter = createRateLimiter({
  max: 5,
  windowMs: 60 * 60_000,
  message: "Too many responses from this connection. Try again later, or visit the station.",
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

export function noticesRoutes() {
  const router = Router();
  const view = requirePermission("notices.view");
  const serve = requirePermission("notices.serve");

  router.get("/", view, query(listSchema), async (req, res) => {
    res.json(await listNotices(actor(req), req.validQuery));
  });
  router.get("/outbox", view, query(outboxSchema), async (req, res) => {
    res.json(await listOutbox(actor(req), req.validQuery));
  });
  router.get("/:id", view, async (req, res) => {
    res.json(await getNotice(actor(req), idOf(req)));
  });
  router.get("/:id/document", view, async (req, res) => {
    res.json(await noticeDocument(actor(req), idOf(req)));
  });
  router.post("/:id/posted", serve, body(postedSchema), async (req, res) => {
    res.json(await markPosted(actor(req), idOf(req), req.body, ctx(req)));
  });
  router.post("/:id/service-failed", serve, body(failedSchema), async (req, res) => {
    res.json(await markServiceFailed(actor(req), idOf(req), req.body.note, ctx(req)));
  });
  router.post("/:id/reserve", serve, body(reserveSchema), async (req, res) => {
    res.json(await reserveNotice(actor(req), idOf(req), req.body, ctx(req)));
  });
  router.post(
    "/:id/withdraw",
    requirePermission("notices.withdraw"),
    body(z.object({ reason })),
    async (req, res) => {
      res.json(await withdrawNotice(actor(req), idOf(req), req.body.reason, ctx(req)));
    },
  );
  router.post(
    "/:id/court",
    requirePermission("court.confirmReferral"),
    body(z.object({ note: reason })),
    async (req, res) => {
      res.json(await confirmCourt(actor(req), idOf(req), req.body.note, ctx(req)));
    },
  );
  router.post(
    "/:id/responses",
    requirePermission("notices.recordResponse"),
    body(responseSchema),
    async (req, res) => {
      res.json(await recordResponse(actor(req), idOf(req), req.body, ctx(req)));
    },
  );
  router.post(
    "/:id/nomination-review",
    requirePermission("notices.reviewNomination"),
    body(nominationReviewSchema),
    async (req, res) => {
      res.json(await reviewNomination(actor(req), idOf(req), req.body, ctx(req)));
    },
  );
  router.post(
    "/:id/dispute-review",
    requirePermission("notices.reviewDispute"),
    body(disputeReviewSchema),
    async (req, res) => {
      res.json(await reviewDispute(actor(req), idOf(req), req.body, ctx(req)));
    },
  );
  return router;
}

/** /api/v1/public/notices — the addressee, with the notice number and plate. */
export function publicNoticesRoutes() {
  const router = Router();
  router.post(
    "/lookup",
    publicRoute(),
    publicLookupLimiter.middleware,
    body(z.object(identify)),
    async (req, res) => {
      res.json(await publicLookup(req.body));
    },
  );
  router.post(
    "/nominate",
    publicRoute(),
    publicRespondLimiter.middleware,
    body(z.object({ ...identify, ...nominationFields, declaration })),
    async (req, res) => {
      res.json(await publicRespond(req.body, ctx(req), "nomination"));
    },
  );
  router.post(
    "/dispute",
    publicRoute(),
    publicRespondLimiter.middleware,
    body(z.object({ ...identify, ...disputeFields, declaration })),
    async (req, res) => {
      res.json(await publicRespond(req.body, ctx(req), "dispute"));
    },
  );
  return router;
}
