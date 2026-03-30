import mongoose from "mongoose";

const importedOtherRecordSchema = new mongoose.Schema(
  {
    uploadType: {
      type: String,
      required: true,
      enum: ["student", "placement", "other"],
      default: "other",
      trim: true,
    },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    sourceJobId: { type: String, required: true, trim: true, index: true },
    sourceRowNumber: { type: Number, required: true, min: 1 },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

importedOtherRecordSchema.index({ sourceJobId: 1, sourceRowNumber: 1 }, { unique: true });

const ImportedOtherRecord = mongoose.model("ImportedOtherRecord", importedOtherRecordSchema);

export default ImportedOtherRecord;
