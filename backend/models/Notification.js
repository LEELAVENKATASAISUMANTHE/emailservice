const mongoose = require("mongoose");

const eligibleStudentSchema = new mongoose.Schema(
  {
    student_id: { type: String, required: true, trim: true },
    full_name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true }
  },
  {
    _id: false
  }
);

const notificationSchema = new mongoose.Schema(
  {
    jobId: { type: Number, required: true, unique: true, index: true },
    companyName: { type: String, required: true, trim: true },
    criteria: { type: mongoose.Schema.Types.Mixed, required: true },
    eligibleStudents: {
      type: [eligibleStudentSchema],
      required: true,
      default: []
    },
    eligibleCount: { type: Number, required: true, min: 0 },
    applicationDeadline: { type: Date, required: true },
    status: {
      type: String,
      enum: ["PENDING_APPROVAL", "APPROVED", "REJECTED", "SENT"],
      default: "PENDING_APPROVAL",
      required: true
    },
    adminMessage: { type: String, default: null },
    attachments: { type: [String], default: null },
    createdAt: { type: Date, required: true, default: Date.now },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null }
  },
  {
    versionKey: false
  }
);

module.exports = mongoose.model("Notification", notificationSchema);
