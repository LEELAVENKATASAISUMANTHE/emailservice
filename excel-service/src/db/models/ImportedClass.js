import mongoose from "mongoose";

const importedClassSchema = new mongoose.Schema(
  {
    uploadType: {
      type: String,
      required: true,
      enum: ["student", "placement", "other"],
      default: "student",
      trim: true,
    },
    className: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    sourceJobId: { type: String, required: true, trim: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

importedClassSchema.index({ uploadType: 1, className: 1, department: 1 }, { unique: true });

const ImportedClass = mongoose.model("ImportedClass", importedClassSchema);

export default ImportedClass;
