import { createStationSchema } from "./regionalStations.validation.js";
import { createStation, listStations } from "./regionalStations.service.js";

export async function createStationHandler(req, res, next) {
  try {
    const data = createStationSchema.parse(req.body);
    const station = await createStation(data);
    res.status(201).json({ data: station });
  } catch (err) {
    next(err);
  }
}

export async function listStationsHandler(req, res, next) {
  try {
    const stations = await listStations();
    res.json({ data: stations });
  } catch (err) {
    next(err);
  }
}
