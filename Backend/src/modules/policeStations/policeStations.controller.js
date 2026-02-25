import asyncHandler from "../../utils/asyncHandler.js";
import PoliceStation from "../../db/providers/mongo/models/PoliceStation.js";

export const list = asyncHandler(async (req, res) => {
  const items = await PoliceStation.find({})
    .select("name area location")
    .limit(2000)
    .lean();
  res.json(items);
});

export const nearest = asyncHandler(async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const limit = Math.min(Number(req.query.limit || 3), 20);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ message: "lat and lng are required numbers" });
  }

  const items = await PoliceStation.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [lng, lat] },
        distanceField: "distanceMeters",
        spherical: true,
      },
    },
    { $limit: limit },
    {
      $project: {
        name: 1,
        area: 1,
        lat: { $arrayElemAt: ["$location.coordinates", 1] },
        lng: { $arrayElemAt: ["$location.coordinates", 0] },
        distanceKm: { $divide: ["$distanceMeters", 1000] },
      },
    },
  ]);

  res.json(items);
});