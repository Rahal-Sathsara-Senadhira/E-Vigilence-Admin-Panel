import User from "../../../db/providers/mongo/models/User.js";

export const usersMongoRepo = {
  async findMany(filters = {}) {
    const query = {};

    if (filters.role) query.role = filters.role;
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