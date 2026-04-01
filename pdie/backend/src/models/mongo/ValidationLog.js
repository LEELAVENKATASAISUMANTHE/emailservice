import mongoose from 'mongoose';

const ValidationLogSchema = new mongoose.Schema(
  {
    uploadId: { type: String, required: true },
    templateId: { type: String, required: true },
    rowNumber: { type: Number, required: true },
    chunkId: { type: String },
    errors: [{ type: String, required: true }],
    payload: { type: Object }
  },
  { timestamps: true, collection: 'validation_logs', suppressReservedKeysWarning: true }
);

export const ValidationLogModel = mongoose.model('ValidationLog', ValidationLogSchema);
