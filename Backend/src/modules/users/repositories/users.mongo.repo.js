import User from "../../../db/providers/mongo/models/User.js";

// This app's User schema doesn't enforce this (Mongoose enum validation only
// runs on save, not on read), but the `users` collection is genuinely shared
// with the citizen-reporting app now (role: "user", field `password` not
// `password_hash`) — never let those documents surface as staff accounts.
const STAFF_ROLES = ["hq", "station_admin", "station_officer"];

export const usersMongoRepo = {
  async findMany(filters = {}) {
    const query = { role: { $in: STAFF_ROLES } };

    // Narrow within the staff roles only — a request for role=user (or
    // anything else outside STAFF_ROLES) is ignored rather than honored, so
    // it can never widen the query to citizen accounts.
    if (filters.role && STAFF_ROLES.includes(filters.role)) {
      query.role = filters.role;
    }
    if (typeof filters.isActive === "boolean") query.isActive = filters.isActive;
    if (filters.stationId) query.stationId = filters.stationId;

    // basic search
    if (filters.q) {
      query.$or = [
        { name: { $regex: filters.q, $options: "i" } },
        { email: { $regex: filters.q, $options: "i" } },
      ];
    }

    return User.find(query).sort({ createdAt: -1 }).lean();
  },

  async findById(id) {
    return User.findById(id).lean();
  },

  async create(data) {
    const doc = await User.create(data);
    return doc.toObject();
  },

  async updateById(id, patch) {
    return User.findByIdAndUpdate(id, patch, { new: true }).lean();
  },

  async deleteById(id) {
    const r = await User.findByIdAndDelete(id).lean();
    return !!r;
  },
};