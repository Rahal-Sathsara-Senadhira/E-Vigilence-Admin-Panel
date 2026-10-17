import jwt from "jsonwebtoken";
import { JWT_SECRET, NODE_ENV } from "../../config/env.js";
import User from "../../db/providers/mongo/models/User.js";
import PoliceStation from "../../db/providers/mongo/models/PoliceStation.js";
import { verifyPassword } from "../../utils/password.js";

const AUTH_COOKIE = "token";
const STAFF_ROLES = new Set(["hq", "station_admin", "station_officer"]);
const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7d, matches JWT expiresIn

function signUserToken(userDoc) {
  return jwt.sign(
    {
      id: userDoc._id?.toString?.() || userDoc.id,
      email: userDoc.email,
      role: userDoc.role,
      stationId: userDoc.stationId || null,
      name: userDoc.name,
      avatarUrl: userDoc.avatarUrl || null,
    },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: NODE_ENV === "production",
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  });
}

export async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "email and password are required" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Support both schema styles
    const isActive = user.isActive === true || user.status === "active";

    if (!isActive) {
      return res.status(401).json({ message: "Account inactive" });
    }

    const ok = verifyPassword(String(password), user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Same rules requireAuth enforces on every request — refused here too,
    // so a login doesn't succeed only to be rejected on the next call.
    // The `users` collection is shared with the citizen app.
    if (!STAFF_ROLES.has(user.role)) {
      return res.status(403).json({ message: "This account cannot sign in to the admin panel" });
    }

    if (user.role !== "hq") {
      const station = user.stationId
        ? await PoliceStation.findById(user.stationId).select("isActive").lean()
        : null;
      if (!station || station.isActive === false) {
        return res.status(403).json({ message: "This account's station is not active" });
      }
    }

    const token = signUserToken(user);
    setAuthCookie(res, token);

    return res.json({
      data: {
        token,
        user: {
          id: user._id?.toString?.() || user.id,
          _id: user._id?.toString?.() || user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          stationId: user.stationId || null,
          avatarUrl: user.avatarUrl || null,
        },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Login failed" });
  }
}

export async function me(req, res) {
  return res.json({ data: { user: req.user || null } });
}

export async function logout(_req, res) {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: NODE_ENV === "production",
  });
  return res.json({ ok: true });
}
