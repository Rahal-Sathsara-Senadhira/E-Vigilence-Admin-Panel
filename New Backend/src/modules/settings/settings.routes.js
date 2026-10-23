// /api/v1/settings — time limits (docs/09).

import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "#src/core/access/guards.js";
import { body } from "#src/core/http/validate.js";
import { listTimeLimits, setTimeLimit } from "./settings.service.js";

const changeSchema = z.object({
  value: z.coerce.number({ error: "Enter a number." }).int("Whole numbers only."),
  reason: z.string().trim().min(5, "Say why it is changing.").max(500),
});

export function settingsRoutes() {
  const router = Router();
  const manage = requirePermission("settings.timeLimits");
  router.get("/time-limits", manage, async (_req, res) => {
    res.json(await listTimeLimits());
  });
  router.put("/time-limits/:key", manage, body(changeSchema), async (req, res) => {
    const actor = /** @type {NonNullable<typeof req.auth>} */ (req.auth);
    res.json(
      await setTimeLimit(actor, String(req.params.key), req.body, {
        ip: req.ip ?? null,
        userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
      }),
    );
  });
  return router;
}
