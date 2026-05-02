import asyncHandler from "../../utils/asyncHandler.js";
import PoliceStation from "../../db/providers/mongo/models/PoliceStation.js";
import Violation from "../../db/providers/mongo/models/Violation.js";
import Dispatch from "../../db/providers/mongo/models/Dispatch.js";

export const list = asyncHandler(async (req, res) => {
  const items = await PoliceStation.find({})
    .select("name area location")
    .limit(2000)
    .lean();
  res.json(items);
});

export const getById = asyncHandler(async (req, res) => {
  const station = await PoliceStation.findById(req.params.id).lean();
  if (!station) {
    return res.status(404).json({ message: "Police station not found" });
  }
  res.json(station);
});

export const getViolationsByStation = asyncHandler(async (req, res) => {
  const { stationId } = req.params;
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const offset = Number(req.query.offset || 0);

  // Get station details
  const station = await PoliceStation.findById(stationId).lean();
  if (!station) {
    return res.status(404).json({ message: "Police station not found" });
  }

  // Find all dispatches for this station to get assigned violations
  const dispatches = await Dispatch.find({ station: stationId })
    .populate("violation")
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .lean();

  const total = await Dispatch.countDocuments({ station: stationId });

  // Extract violation data from dispatches
  const violations = dispatches
    .map(d => d.violation)
    .filter(v => v != null); // Remove null violations

  // Format violations with evidence data
  const formattedViolations = violations.map(v => ({
    _id: v._id,
    id: v._id,
    title: v.title,
    type: v.type,
    status: v.status,
    description: v.description,
    location: v.location,
    images: Array.isArray(v.images) ? v.images : [],
    videos: Array.isArray(v.videos) ? v.videos : [],
    audios: Array.isArray(v.audios) ? v.audios : [],
    createdAt: v.createdAt,
  }));

  res.json({
    station,
    violations: formattedViolations,
    meta: {
      total,
      limit,
      offset,
    },
  });
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