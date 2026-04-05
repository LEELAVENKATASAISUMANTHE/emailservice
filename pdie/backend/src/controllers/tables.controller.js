import { config } from '../config/index.js';
import { getTablesRelatedToBaseTable, listPublicTableDetails, listPublicTables } from '../db/postgres.js';

export const listTemplateTables = async (_req, res) => {
  const tables = await listPublicTableDetails();
  res.json({
    tables: Object.values(tables).map((table) => ({
      name: table.table_name,
      fields: table.columns.map((column) => column.column_name)
    }))
  });
};

export const listTables = async (_req, res) => {
  const tables = await listPublicTables();
  res.json(tables);
};

export const getStudentRelatedTables = async (_req, res) => {
  const graph = await getTablesRelatedToBaseTable('students');
  res.json(graph);
};

export const listTableDetails = async (_req, res) => {
  const tables = await listPublicTableDetails();
  res.json({
    schema: config.postgres.schema,
    table_count: Object.keys(tables).length,
    tables
  });
};
