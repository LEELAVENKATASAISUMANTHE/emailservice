import mongoose from "mongoose";

const importedStudentSchema = new mongoose.Schema(
  {
    uploadType: {
      type: String,
      required: true,
      enum: ["student", "placement", "other"],
      default: "student",
      trim: true,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    class: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    sourceJobId: { type: String, required: true, trim: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

importedStudentSchema.index({ uploadType: 1, email: 1 }, { unique: true });

const ImportedStudent = mongoose.model("ImportedStudent", importedStudentSchema);

export default ImportedStudent;
