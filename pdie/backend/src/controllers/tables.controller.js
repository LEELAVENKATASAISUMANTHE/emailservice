import { fetchTables, fetchTableColumnsDetailed, fetchTableRelationships, fetchTablePreview } from '../db/postgres.js';
import { HttpError } from '../middlewares/errorHandler.js';

export const listTables = async (_req, res) => {
  const tables = await fetchTables();
  res.json({ tables });
};

export const getTableColumns = async (req, res) => {
  const { tableName } = req.params;
  const columns = await fetchTableColumnsDetailed(tableName);
  if (!columns.length) {
    throw new HttpError(404, `Table "${tableName}" not found`);
  }
  res.json({ table: tableName, columns, columnCount: columns.length });
};

export const getTableRelationships = async (req, res) => {
  const { tableName } = req.params;
  const relationships = await fetchTableRelationships(tableName);
  res.json({ table: tableName, relationships });
};

export const getTablePreview = async (req, res) => {
  const { tableName } = req.params;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const preview = await fetchTablePreview(tableName, limit);
  if (!preview) {
    throw new HttpError(404, `Table "${tableName}" not found`);
  }
  res.json({ table: tableName, ...preview });
};
