import mongoose from 'mongoose';

const UploadSchema = new mongoose.Schema(
  {
    uploadId: { type: String, required: true, unique: true },
    templateId: { type: String, required: true },
    fileKey: { type: String, required: true },
    fileHash: { type: String, required: true },
    rowCount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'validating', 'validated', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    processingMode: {
      type: String,
      enum: ['sync', 'async'],
      required: true
    },
    pendingChunks: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    duplicateOf: { type: String }
  },
  { timestamps: true, collection: 'uploads' }
);

export const UploadModel = mongoose.model('Upload', UploadSchema);
