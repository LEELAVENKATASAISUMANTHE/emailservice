import { getTablesRelatedToBaseTable, listPublicTables } from '../db/postgres.js';

export const listTables = async (_req, res) => {
  const tables = await listPublicTables();
  res.json(tables);
};

export const getStudentRelatedTables = async (_req, res) => {
  const graph = await getTablesRelatedToBaseTable('students');
  res.json(graph);
};
