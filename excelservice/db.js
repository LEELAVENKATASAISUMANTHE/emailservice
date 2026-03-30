import { Pool } from 'pg'

// Database connection configuration
export const pool = new Pool({
  user: 'admin',
  host: '134.209.159.132',
  database: 'placement', // Database containing placement tables
  password: 'sumanth123',
  port: 5432, // Default PostgreSQL port
});

/**
 * Connects to the PostgreSQL database and tests the connection
 */
export async function connectToDB() {
  try {
    const client = await pool.connect();
    console.log('Successfully connected to the database at 134.209.159.132');
    
    // Execute a simple test query
    const res = await client.query('SELECT NOW()');
    console.log('Current Database Time:', res.rows[0].now);
    
    // Release the client back to the pool
    client.release();
    return true;
  } catch (err) {
    console.error('Failed to connect to the database:', err.message);
    return false;
  }
}


export async function fetchtables(){
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT table_name FROM information_schema.tables WHERE table_schema = $1', ['public']);
    const tableNames = res.rows.map(row => row.table_name);
    console.log(tableNames);
    client.release();
    return tableNames;
  } catch (error) {
    console.error('Failed to fetch tables:', error.message);
    return false;
  }
}

export async function fetchtabledata(tablename){
  try {
    const client = await pool.connect();
    const res = await client.query(`SELECT * FROM ${tablename}`);
    console.log(res.rows);
    client.release();
    return res.rows;
  } catch (error) {
    console.error('Failed to fetch table data:', error.message);
    return false;
  }
}

/**
 * Returns column metadata for a single table:
 * column_name, data_type, is_nullable, column_default
 */
export async function fetchTableColumns(tablename) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [tablename]
    );
    return res.rows;
  } catch (error) {
    console.error('Failed to fetch columns for', tablename, error.message);
    return [];
  } finally {
    client.release();
  }
}

/**
 * Bulk-inserts rows into tablename within the supplied transaction client.
 * rows: array of plain objects { col: value }
 * Returns array of inserted row counts.
 */
export async function bulkInsert(tablename, rows, txClient) {
  if (!rows || rows.length === 0) return [];

  const columns = Object.keys(rows[0]);
  const results = [];

  for (const row of rows) {
    const values = columns.map(c => row[c]);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const colList = columns.map(c => `"${c}"`).join(', ');

    const query = `INSERT INTO ${tablename} (${colList}) VALUES (${placeholders}) RETURNING *`;
    const res = await txClient.query(query, values);
    results.push(res.rows[0]);
  }

  return results;
}

export async function fetchJoinedTables(tables) {
  const client = await pool.connect();

  try {
    if (!tables || tables.length === 0) {
      throw new Error("No tables provided");
    }

    // ✅ Validate tables
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);

    const validTables = tableRes.rows.map(t => t.table_name);

    tables.forEach(t => {
      if (!validTables.includes(t)) {
        throw new Error(`Invalid table: ${t}`);
      }
    });

    // ✅ Get FK relationships
    const fkRes = await client.query(`
      SELECT
          tc.table_name AS source_table,
          kcu.column_name AS source_column,
          ccu.table_name AS target_table,
          ccu.column_name AS target_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
    `);

    const fkMap = fkRes.rows;

    let baseTable = tables[0];
    let joinClauses = "";

    let commonKeys = new Set();

    // ✅ Build joins + detect common keys
    for (const table of tables) {
      if (table === baseTable) continue;

      const relation = fkMap.find(
        fk =>
          (fk.source_table === table && fk.target_table === baseTable) ||
          (fk.source_table === baseTable && fk.target_table === table)
      );

      if (!relation) continue;

      // Track common key
      if (relation.source_table === baseTable) {
        commonKeys.add(relation.source_column);
      } else {
        commonKeys.add(relation.target_column);
      }

      // JOIN
      if (relation.source_table === table) {
        joinClauses += `
          LEFT JOIN ${table}
          ON ${table}.${relation.source_column} = ${baseTable}.${relation.target_column}
        `;
      } else {
        joinClauses += `
          LEFT JOIN ${table}
          ON ${baseTable}.${relation.source_column} = ${table}.${relation.target_column}
        `;
      }
    }

    // ✅ SIMPLE QUERY (no select manipulation)
    const query = `
      SELECT * 
      FROM ${baseTable}
      ${joinClauses}
    `;

    const res = await client.query(query);

    if (!res.rows.length) {
      return { query, headers: [], data: [] };
    }

    // ✅ Get headers
    let headers = Object.keys(res.rows[0]);

    // 🔥 Move common keys to top
    const common = headers.filter(h => commonKeys.has(h));
    const others = headers.filter(h => !commonKeys.has(h));

    const orderedHeaders = [...common, ...others];

    // 🔥 Reorder each row
    const orderedData = res.rows.map(row => {
      const newRow = {};
      orderedHeaders.forEach(key => {
        newRow[key] = row[key];
      });
      return newRow;
    });

    return {
      query,
      headers: orderedHeaders,
      data: orderedData
    };

  } catch (error) {
    console.error("JOIN ERROR:", error.message);
    return null;
  } finally {
    client.release();
  }
}