import asyncHandler from "../../utils/asyncHandler.js";
import * as svc from "./dashboard.service.js";

export const get = asyncHandler(async (req, res) => {
  const data = await svc.get();
  res.json(data);
});
