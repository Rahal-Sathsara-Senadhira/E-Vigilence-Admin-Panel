import jwt from "jsonwebtoken";
import { JWT_SECRET, NODE_ENV } from "../config/env.js";

function buildUserFromJwtPayload(payload) {
  return {
    id: payload.id || payload._id || payload.userId || null,
    email: payload.email || null,
    role: payload.role || "hq",
    stationId: payload.stationId || payload.station_id || null,
    name: payload.name || payload.full_name || null,
  };
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

// ✅ Strict auth middleware
export function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // ✅ DEV bypass so demo login doesn't crash ObjectId casting
    if (NODE_ENV !== "production" && token === "demo-token") {
      req.user = {
        id: "000000000000000000000001", // ✅ valid ObjectId string
        name: "Alex Ortega",
        email: "admin@evigilance.com",
        role: "hq",
        stationId: null,
      };
      return next();
    }

    if (NODE_ENV !== "production" && token === "demo-station-token") {
      req.user = {
        id: "000000000000000000000002", // ✅ valid ObjectId string
        name: "Station Officer",
        email: "station@galle.police",
        role: "station_officer",
        stationId: req.headers["x-demo-station-id"] || null,
      };
      return next();
    }

    const payload = jwt.verify(token, JWT_SECRET);
    req.user = buildUserFromJwtPayload(payload);
    return next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

// ✅ Optional auth (won’t block if missing/invalid)
export function optionalAuth(req, _res, next) {
  const token = getBearerToken(req);
  if (!token) return next();

  if (NODE_ENV !== "production" && token === "demo-token") {
    req.user = {
      id: "000000000000000000000001",
      name: "Alex Ortega",
      email: "admin@evigilance.com",
      role: "hq",
      stationId: null,
    };
    return next();
  }

  if (NODE_ENV !== "production" && token === "demo-station-token") {
    req.user = {
      id: "000000000000000000000002",
      name: "Station Officer",
      email: "station@galle.police",
      role: "station_officer",
      stationId: req.headers["x-demo-station-id"] || null,
    };
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = buildUserFromJwtPayload(payload);
  } catch {
    // ignore
  }

  next();
}

// ✅ Role guard
export function requireRole(...roles) {
  const allowed = new Set(roles.filter(Boolean));

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (allowed.size === 0) return next();

    const userRole = req.user.role || "user";

    if (!allowed.has(userRole)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
}