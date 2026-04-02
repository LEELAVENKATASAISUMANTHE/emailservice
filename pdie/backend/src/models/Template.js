import mongoose from 'mongoose';

const HeaderMapSchema = new mongoose.Schema(
  {
    header: { type: String, required: true },
    table: { type: String, required: true },
    column: { type: String, required: true }
  },
  { _id: false }
);

const TemplateSchema = new mongoose.Schema(
  {
    templateId: { type: String, required: true, unique: true, index: true },
    tables: [{ type: String, required: true }],
    joinKeys: [{ type: String, required: true }],
    headerMap: { type: [HeaderMapSchema], default: [] },
    excludedColumns: { type: Object, default: {} },
    schemaMeta: { type: Object, default: {} },
    foreignKeys: { type: [Object], default: [] },
    workbookMeta: { type: Object, default: null },
    minioKey: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  },
  {
    collection: 'pdie_templates',
    versionKey: false
  }
);

export const TemplateModel = mongoose.models.Template || mongoose.model('Template', TemplateSchema);
