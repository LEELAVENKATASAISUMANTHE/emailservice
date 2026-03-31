import mongoose from 'mongoose';

const ProcessingLogSchema = new mongoose.Schema(
  {
    uploadId: { type: String, required: true },
    stage: { type: String, required: true },
    level: {
      type: String,
      enum: ['info', 'warning', 'error'],
      default: 'info'
    },
    message: { type: String, required: true },
    metadata: { type: Object }
  },
  { timestamps: true, collection: 'processing_logs' }
);

export const ProcessingLogModel = mongoose.model('ProcessingLog', ProcessingLogSchema);
