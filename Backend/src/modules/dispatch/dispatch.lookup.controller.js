import Dispatch from "../../db/providers/mongo/models/Dispatch.js";

export async function getByViolation(req, res) {
  try {
    const { id } = req.params;

    const dispatch = await Dispatch.findOne({ violation: id })
      .sort({ createdAt: -1 })
      .populate("station")
      .lean();

    if (!dispatch) {
      return res.status(404).json({ message: "No dispatch found for this violation" });
    }

    return res.json({ data: { dispatch } });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to load dispatch" });
  }
}