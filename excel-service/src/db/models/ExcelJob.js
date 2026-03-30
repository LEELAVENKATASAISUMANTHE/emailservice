import mongoose from "mongoose";

const failedRowPreviewSchema = new mongoose.Schema(
  {
    rowNumber: { type: Number, required: true, min: 1 },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    error: { type: String, required: true },
  },
  {
    _id: false,
  }
);

const excelJobSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, unique: true, index: true, trim: true },
    uploadType: {
      type: String,
      required: true,
      enum: ["student", "placement", "other"],
      default: "student",
      trim: true,
    },
    createdBy: { type: String, required: true, trim: true },
    fileHash: { type: String, required: true, trim: true, index: true },
    status: {
      type: String,
      required: true,
      enum: ["processing", "completed", "failed"],
      default: "processing",
    },
    progress: { type: Number, required: true, default: 0, min: 0, max: 100 },
    attemptsMade: { type: Number, required: true, default: 0, min: 0 },
    maxAttempts: { type: Number, required: true, default: 3, min: 1 },
    fileName: { type: String, required: true, trim: true },
    totalRows: { type: Number, required: true, default: 0, min: 0 },
    successCount: { type: Number, required: true, default: 0, min: 0 },
    failedCount: { type: Number, required: true, default: 0, min: 0 },
    failedRowPreview: {
      type: [failedRowPreviewSchema],
      default: [],
    },
    errorFileUrl: { type: String, default: null },
    errorStoragePath: { type: String, default: null },
    failureReason: { type: String, default: null },
    retentionExpiresAt: { type: Date, required: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

excelJobSchema.index(
  { createdBy: 1, uploadType: 1, fileHash: 1, status: 1, retentionExpiresAt: 1 },
  { name: "excel_job_dedupe_lookup" }
);

const ExcelJob = mongoose.model("ExcelJob", excelJobSchema);

export default ExcelJob;
