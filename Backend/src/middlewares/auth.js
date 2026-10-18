import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";
import User from "../db/providers/mongo/models/User.js";
import PoliceStation from "../db/providers/mongo/models/PoliceStation.js";

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

const STAFF_ROLES = new Set(["dev", "hq", "station_officer"]);
const STATION_ROLES = new Set(["station_officer"]);

// Same rule as auth.controller.js#login — both schema styles.
function isActiveAccount(user) {
  return user.isActive === true || user.status === "active";
}

// The JWT only proves who the caller *was* when they logged in (it lives for
// 7 days). Re-reads the account on every request so that deactivating,
// deleting, demoting or transferring a user — or deactivating their station
// — takes effect immediately instead of when the token expires. Role and
// station always come from the database, never the token.
async function loadCurrentUser(tokenUser) {
  const account = await User.findById(tokenUser.id)
    .select("name email role stationId isActive status")
    .lean();

  if (!account || !isActiveAccount(account) || !STAFF_ROLES.has(account.role)) {
    return null;
  }

  if (STATION_ROLES.has(account.role)) {
    if (!account.stationId) return null;
    const station = await PoliceStation.findById(account.stationId).select("isActive").lean();
    if (!station || station.isActive === false) return null;
  }

  return {
    id: String(account._id),
    email: account.email || null,
    role: account.role,
    stationId: account.stationId ? String(account.stationId) : null,
    name: account.name || tokenUser.name || null,
  };
}

// ✅ Strict auth middleware
export async function requireAuth(req, res, next) {
  let user;

  try {
    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    const tokenUser = buildUserFromJwtPayload(payload);
    user = tokenUser ? await loadCurrentUser(tokenUser) : null;
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  req.user = user;
  return next();
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

    // "dev" is the developer/owner role and has superadmin access across all routes
    if (userRole === "dev") {
      return next();
    }

    if (!allowed.has(userRole)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
}