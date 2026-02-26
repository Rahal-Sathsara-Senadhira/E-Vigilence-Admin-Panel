import asyncHandler from "../../utils/asyncHandler.js";
import * as svc from "./dashboard.service.js";

export const get = asyncHandler(async (req, res) => {
  const days = req.query?.days;
  const data = await svc.get({ days });
  res.json(data);
});