import Violation from "../../db/providers/mongo/models/Violation.js";
import PoliceStation from "../../db/providers/mongo/models/PoliceStation.js";
import Dispatch from "../../db/providers/mongo/models/Dispatch.js";

export async function dispatchNearestStationForViolation(violationId, userId = null) {
  const violation = await Violation.findById(violationId);
  if (!violation) {
    const err = new Error("Violation not found");
    err.status = 404;
    throw err;
  }

  const lat = violation?.location?.lat;
  const lng = violation?.location?.lng;

  if (lat == null || lng == null) {
    const err = new Error("Violation has no lat/lng location");
    err.status = 400;
    throw err;
  }

  // Find nearest police station
  const station = await PoliceStation.findOne({
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        // optional: limit to 50km
        // $maxDistance: 50000,
      },
    },
  });

  if (!station) {
    const err = new Error("No police station found near this violation");
    err.status = 404;
    throw err;
  }

  // If already dispatched, return existing dispatch
  const dispatch = await Dispatch.findOneAndUpdate(
    { violation: violation._id },
    {
      $setOnInsert: {
        violation: violation._id,
        station: station._id,
        sentBy: userId,
        sentAt: new Date(),
        status: "sent",
      },
    },
    { upsert: true, new: true }
  );

  return {
    dispatch,
    station,
  };
}