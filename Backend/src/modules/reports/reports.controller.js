import asyncHandler from "../../utils/asyncHandler.js";
import * as svc from "./reports.service.js";

export const summary = asyncHandler(async (req, res) => {
  const data = await svc.summary({
    from: req.query.from,
    to: req.query.to,
    type: req.query.type,
  });
  res.json(data);
});
