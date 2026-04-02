import mongoose from 'mongoose';

const UploadErrorSchema = new mongoose.Schema(
  {
    field: { type: String, default: '' },
    value: { type: String, default: '' },
    message: { type: String, required: true }
  },
  { _id: false }
);

const UploadRowSchema = new mongoose.Schema(
  {
    rowIndex: { type: Number, required: true },
    status: { type: String, enum: ['ok', 'error'], required: true },
    errors: { type: [UploadErrorSchema], default: [] }
  },
  { _id: false }
);

const UploadLogSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    rows: { type: [UploadRowSchema], default: [] }
  },
  {
    collection: 'pdie_upload_logs',
    versionKey: false
  }
);

export const UploadLogModel = mongoose.models.UploadLog || mongoose.model('UploadLog', UploadLogSchema);
