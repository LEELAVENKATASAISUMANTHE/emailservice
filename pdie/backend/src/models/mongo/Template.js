import mongoose from 'mongoose';

const TemplateSchema = new mongoose.Schema(
  {
    templateId: { type: String, required: true, unique: true },
    version: { type: Number, required: true, default: 1 },
    tables: [{ type: String, required: true }],
    joinKeys: [{ type: String, required: true }],
    joinGraph: { type: Object, required: true },
    headers: [{ type: String, required: true }],
    minioKey: { type: String, required: true },
    checksum: { type: String, required: true },
    metadata: { type: Object }
  },
  { timestamps: true, collection: 'templates' }
);

export const TemplateModel = mongoose.model('Template', TemplateSchema);
