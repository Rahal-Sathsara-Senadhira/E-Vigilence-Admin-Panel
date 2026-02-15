import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true },

    user_id: { type: String, default: null },
    is_read: { type: Boolean, default: false },
    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);

NotificationSchema.index({ user_id: 1, createdAt: -1 });

const Notification =
  mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);

export default Notification;
