import mongoose from 'mongoose';

const StudentSchema = new mongoose.Schema(
  {
    first_name: { type: String, default: null, trim: true },
    middle_name: { type: String, default: null, trim: true },
    last_name: { type: String, default: null, trim: true },
    full_name: { type: String, default: null, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true }
  },
  {
    collection: 'students',
    timestamps: true,
    versionKey: false
  }
);

export const StudentModel = mongoose.models.Student || mongoose.model('Student', StudentSchema);
