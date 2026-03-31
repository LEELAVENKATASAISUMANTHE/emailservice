import { fetchTables } from '../db/postgres.js';

export const listTables = async (_req, res) => {
  const tables = await fetchTables();
  res.json({ tables });
};
