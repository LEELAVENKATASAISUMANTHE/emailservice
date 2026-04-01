import mongoose from 'mongoose';

const UploadSchema = new mongoose.Schema(
  {
    uploadId: { type: String, required: true, unique: true, index: true },
    templateId: { type: String, required: true, index: true },
    fileKey: { type: String, required: true },
    fileHash: { type: String, required: true, index: true },
    originalFileName: { type: String },
    fileSize: { type: Number, default: 0 },
    rowCount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'validating', 'validated', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true
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
