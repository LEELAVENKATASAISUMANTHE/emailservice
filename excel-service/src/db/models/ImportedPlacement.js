import mongoose from "mongoose";

const importedPlacementSchema = new mongoose.Schema(
  {
    uploadType: {
      type: String,
      required: true,
      enum: ["student", "placement", "other"],
      default: "placement",
      trim: true,
    },
    company: { type: String, required: true, trim: true },
    status: { type: String, default: null, trim: true },
    studentEmail: { type: String, required: true, trim: true, lowercase: true },
    studentName: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    sourceJobId: { type: String, required: true, trim: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

importedPlacementSchema.index({ uploadType: 1, company: 1, studentEmail: 1 }, { unique: true });

const ImportedPlacement = mongoose.model("ImportedPlacement", importedPlacementSchema);

export default ImportedPlacement;
