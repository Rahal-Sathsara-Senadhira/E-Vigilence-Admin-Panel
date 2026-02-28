import {
  dispatchNearestStationForViolation,
  getInboxDispatchesForUser,
  getAssignedViolationsForStation,
  stationUpdateViolationForStation,
  getLatestDispatchForViolation,
} from "./dispatch.service.js";

// POST /api/violations/:id/dispatch-nearest
export async function dispatchNearest(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user?._id ?? req.user?.id ?? null;

    const { dispatch, station } = await dispatchNearestStationForViolation(
      id,
      userId
    );

    // ✅ return plain JSON (no { data: ... })
    return res.json({
      dispatch,
      station: {
        _id: station._id,
        name: station.name,
        address: station.address,
        phone: station.phone,
        location: station.location,
        area: station.area,
      },
    });
  } catch (err) {
    const status = err.status || 500;
    return res
      .status(status)
      .json({ message: err.message || "Dispatch failed" });
  }
}

// GET /api/dispatches/by-violation/:id
export async function byViolation(req, res) {
  try {
    const { id } = req.params;

    const dispatch = await getLatestDispatchForViolation(id);

    if (!dispatch) {
      return res.status(404).json({ message: "No dispatch found" });
    }

    // ✅ return plain JSON
    return res.json({ dispatch });
  } catch (err) {
    const status = err.status || 500;
    return res
      .status(status)
      .json({ message: err.message || "Failed to load dispatch" });
  }
}

// GET /api/dispatches/inbox
export async function inbox(req, res) {
  try {
    const role = req.user?.role;
    const stationId = req.user?.stationId || null;

    if (
      role !== "hq" &&
      role !== "admin" &&
      role !== "station_admin" &&
      role !== "station_officer"
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (role !== "hq" && role !== "admin" && !stationId) {
      return res.status(400).json({ message: "Station user has no stationId" });
    }

    const dispatches = await getInboxDispatchesForUser(req.user);

    // ✅ plain JSON
    return res.json({ dispatches });
  } catch {
    return res.status(500).json({ message: "Failed to load inbox" });
  }
}

// GET /api/violations/assigned/me
export async function assignedMe(req, res) {
  try {
    const role = req.user?.role;
    const stationId = req.user?.stationId || null;

    if (role !== "station_admin" && role !== "station_officer") {
      return res
        .status(403)
        .json({ message: "Only station users can view assigned violations" });
    }

    if (!stationId) {
      return res.status(400).json({ message: "Station user has no stationId" });
    }

    const violations = await getAssignedViolationsForStation(stationId);

    // ✅ plain JSON
    return res.json({ violations });
  } catch {
    return res
      .status(500)
      .json({ message: "Failed to load assigned violations" });
  }
}

// PATCH /api/violations/:id/station-update
export async function stationUpdate(req, res) {
  try {
    const role = req.user?.role;
    const stationId = req.user?.stationId || null;

    if (role !== "station_admin" && role !== "station_officer") {
      return res
        .status(403)
        .json({ message: "Only station users can update violations" });
    }

    if (!stationId) {
      return res.status(400).json({ message: "Station user has no stationId" });
    }

    const { id } = req.params;
    const { status, stationNote } = req.body || {};

    const violation = await stationUpdateViolationForStation({
      violationId: id,
      stationId,
      status,
      stationNote,
    });

    // ✅ plain JSON
    return res.json({ violation });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || "Update failed" });
  }
}