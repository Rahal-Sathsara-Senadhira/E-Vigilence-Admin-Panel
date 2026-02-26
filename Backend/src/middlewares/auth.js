import jwt from "jsonwebtoken";
import { JWT_SECRET, NODE_ENV } from "../config/env.js";

function buildUserFromJwtPayload(payload) {
  return {
    id: payload.id || payload._id || payload.userId || null,
    email: payload.email || null,
    role: payload.role || "admin",
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

    // ✅ DEV bypass so your frontend demo login works
    if (NODE_ENV !== "production" && token === "demo-token") {
      req.user = {
        id: "demo-admin",
        name: "Alex Ortega",
        email: "admin@evigilance.com",
        role: "admin",
        stationId: null,
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
      id: "demo-admin",
      name: "Alex Ortega",
      email: "admin@evigilance.com",
      role: "admin",
      stationId: null,
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

// ✅ Role guard (this is what your stations module needs)
export function requireRole(...roles) {
  const allowed = new Set(roles.filter(Boolean));

  return (req, res, next) => {
    // Ensure user exists
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // If no roles passed, treat as "must be authenticated"
    if (allowed.size === 0) return next();

    const userRole = req.user.role || "user";

    if (!allowed.has(userRole)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
}