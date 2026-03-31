import mongoose from 'mongoose';

const FailedChunkSchema = new mongoose.Schema(
  {
    uploadId: { type: String, required: true },
    chunkId: { type: String, required: true },
    rows: { type: Array, required: true },
    reason: { type: String, required: true },
    metadata: { type: Object }
  },
  { timestamps: true, collection: 'failed_chunks' }
);

export const FailedChunkModel = mongoose.model('FailedChunk', FailedChunkSchema);
