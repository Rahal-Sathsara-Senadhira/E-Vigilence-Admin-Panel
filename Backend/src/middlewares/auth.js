import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";

// Returns null for a token missing an id or role — those are never granted
// a default role (previously a role-less token silently became "hq").
function buildUserFromJwtPayload(payload) {
  const id = payload?.id || payload?._id || payload?.userId || null;
  const role = payload?.role || null;
  if (!id || !role) return null;

  return {
    id,
    email: payload.email || null,
    role,
    stationId: payload.stationId || payload.station_id || null,
    name: payload.name || payload.full_name || null,
  };
}

function getBearerToken(req) {
  if (req.cookies?.token) return req.cookies.token;

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

    const payload = jwt.verify(token, JWT_SECRET);
    const user = buildUserFromJwtPayload(payload);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

// ✅ Optional auth (won’t block if missing/invalid)
export function optionalAuth(req, _res, next) {
  const token = getBearerToken(req);
  if (!token) return next();

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = buildUserFromJwtPayload(payload);
    if (user) req.user = user;
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

    const userRole = req.user.role;

    if (!allowed.has(userRole)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
}