import { listPublicTables } from '../db/postgres.js';

export const listTables = async (_req, res) => {
  const tables = await listPublicTables();
  res.json(tables);
};
