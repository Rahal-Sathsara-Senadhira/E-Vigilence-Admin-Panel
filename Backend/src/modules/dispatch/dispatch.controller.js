import { dispatchNearestStationForViolation } from "./dispatch.service.js";

export async function dispatchNearest(req, res) {
  try {
    const { id } = req.params;

    // if you have auth middleware, it might be req.user
    const userId = req.user?._id ?? null;

    const { dispatch, station } = await dispatchNearestStationForViolation(id, userId);

    return res.json({
      data: {
        dispatch,
        station: {
          _id: station._id,
          name: station.name,
          address: station.address,
          phone: station.phone,
          location: station.location,
        },
      },
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || "Dispatch failed" });
  }
}