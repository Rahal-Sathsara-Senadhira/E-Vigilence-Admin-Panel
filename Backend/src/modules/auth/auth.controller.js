import jwt from "jsonwebtoken";
import { JWT_SECRET, NODE_ENV } from "../../config/env.js";
import User from "../../db/providers/mongo/models/User.js";
import { verifyPassword } from "../../utils/password.js";

const AUTH_COOKIE = "token";
const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7d, matches JWT expiresIn

function signUserToken(userDoc) {
  return jwt.sign(
    {
      id: userDoc._id?.toString?.() || userDoc.id,
      email: userDoc.email,
      role: userDoc.role,
      stationId: userDoc.stationId || null,
      name: userDoc.name,
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
