import mongoose from 'mongoose';

const JobSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    templateId: { type: String, required: true, index: true },
    originalFilename: { type: String, required: true },
    fileHash: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['queued', 'validating', 'ingesting', 'done', 'failed'],
      default: 'queued',
      index: true
    },
    totalRows: { type: Number, default: 0 },
    processedRows: { type: Number, default: 0 },
    committedRows: { type: Number, default: 0 },
    rejectedRows: { type: Number, default: 0 },
    errorSummary: { type: String, default: '' }
  },
  {
    collection: 'pdie_jobs',
    timestamps: true,
    versionKey: false
  }
);

export const JobModel = mongoose.models.Job || mongoose.model('Job', JobSchema);
