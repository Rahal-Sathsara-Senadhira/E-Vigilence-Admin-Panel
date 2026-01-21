import { Router } from "express";
import {
  createStationHandler,
  listStationsHandler,
} from "./regionalStations.controller.js";

const router = Router();

router.get("/", listStationsHandler);
router.post("/", createStationHandler);

export default router;
