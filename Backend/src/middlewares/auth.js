import jwt from "jsonwebtoken";
import User from "../db/providers/mongo/models/User.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(payload.sub).lean();
    if (!user || !user.isActive) return res.status(401).json({ message: "Unauthorized" });

    // station users must have stationId
    if ((user.role === "station_admin" || user.role === "station_officer") && !user.stationId) {
      return res.status(403).json({ message: "Station user missing station assignment" });
    }

    req.user = {
      id: String(user._id),
      role: user.role,
      stationId: user.stationId ? String(user.stationId) : null,
      name: user.name,
      email: user.email,
    };

    next();
  } catch (e) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}