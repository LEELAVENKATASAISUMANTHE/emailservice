/**
 * Schema introspection service.
 * Queries PostgreSQL information_schema to build RSI field definitions
 * and CSV templates automatically.
 */

const SKIP_COLUMNS = new Set(['id', 'created_at', 'updated_at', 'deleted_at']);

const ALTERNATE_MATCH_MAP = {
  roll_number:   ['roll', 'Roll No', 'RollNo', 'Roll Number'],
  full_name:     ['name', 'Name', 'Student Name', 'Full Name'],
  email:         ['Email', 'Email ID', 'email_id'],
  phone:         ['mobile', 'Mobile', 'Phone No', 'Contact'],
  mobile:        ['phone', 'Phone', 'Mobile No', 'Contact'],
  semester:      ['sem', 'Sem', 'Semester No'],
  year_of_join:  ['year', 'Year', 'Joining Year', 'batch'],
  department_id: ['dept', 'Department', 'Dept', 'Branch'],
};

function buildAlternateMatches(columnName) {
  if (ALTERNATE_MATCH_MAP[columnName]) return ALTERNATE_MATCH_MAP[columnName];
  const pretty = columnName
    .replace(/_id$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const camel = columnName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return [pretty, camel, columnName.toUpperCase()];
}

function buildExample(columnName, dataType) {
  const col = columnName.toLowerCase();
  if (col.includes('email'))                        return 'student@college.edu';
  if (col.includes('phone') || col.includes('mobile')) return '9876543210';
  if (col.includes('roll'))                         return '21CS001';
  if (col.includes('name'))                         return 'Alice Kumar';
  if (dataType === 'boolean')                       return 'true';
  if (dataType === 'date' || col.includes('date'))  return '2024-06-15';
  if (dataType === 'integer' || dataType === 'bigint') return '1';
  return 'value';
}

/** List all user tables in the public schema (excludes import_logs). */
export async function getTableList(pool) {
  const { rows } = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type   = 'BASE TABLE'
     ORDER BY table_name`
  );
  return rows.map((r) => r.table_name).filter((t) => t !== 'import_logs');
}

async function getColumns(pool, tableName) {
  const { rows } = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = $1
     ORDER BY ordinal_position`,
    [tableName]
  );
  return rows;
}

async function getUniqueColumns(pool, tableName) {
  const { rows } = await pool.query(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema    = kcu.table_schema
     WHERE tc.table_schema    = 'public'
       AND tc.table_name      = $1
       AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')`,
    [tableName]
  );
  return new Set(rows.map((r) => r.column_name));
}

async function getForeignKeys(pool, tableName) {
  const { rows } = await pool.query(
    `SELECT kcu.column_name,
            ccu.table_name  AS ref_table,
            ccu.column_name AS ref_column
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema    = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name
      AND tc.table_schema    = ccu.table_schema
     WHERE tc.table_schema    = 'public'
       AND tc.constraint_type = 'FOREIGN KEY'
       AND kcu.table_name     = $1`,
    [tableName]
  );
  const map = {};
  for (const r of rows) {
    map[r.column_name] = { refTable: r.ref_table, refColumn: r.ref_column };
  }
  return map;
}

async function fetchSelectOptions(pool, refTable, refColumn) {
  const LABEL_CANDIDATES = ['name', 'title', 'label', 'full_name', 'description', 'code'];
  const { rows: colRows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [refTable]
  );
  const available = new Set(colRows.map((r) => r.column_name));
  const labelCol = LABEL_CANDIDATES.find((c) => available.has(c)) || refColumn;

  const sql = `SELECT DISTINCT ${labelCol} AS label, ${refColumn} AS value
               FROM ${refTable} LIMIT 500`;
  const { rows } = await pool.query(sql);
  return rows.map((r) => ({
    label: r.label != null ? String(r.label) : String(r.value),
    value: String(r.value),
  }));
}

/** Build the RSI fields[] array from live PostgreSQL schema. */
export async function buildRsiFields(pool, tableName) {
  const [columns, uniqueCols, foreignKeys] = await Promise.all([
    getColumns(pool, tableName),
    getUniqueColumns(pool, tableName),
    getForeignKeys(pool, tableName),
  ]);

  const fields = [];

  for (const col of columns) {
    const { column_name, data_type, is_nullable, column_default } = col;
    if (SKIP_COLUMNS.has(column_name)) continue;

    const validations = [];

    if (is_nullable === 'NO' && column_default === null) {
      validations.push({ rule: 'required', errorMessage: `${column_name} is required` });
    }
    if (uniqueCols.has(column_name)) {
      validations.push({ rule: 'unique', errorMessage: `${column_name} must be unique` });
    }
    if (column_name.toLowerCase().includes('email')) {
      validations.push({
        rule: 'regex',
        value: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
        errorMessage: 'Must be a valid email address',
      });
    }
    if (column_name.toLowerCase().includes('phone') || column_name.toLowerCase().includes('mobile')) {
      validations.push({
        rule: 'regex',
        value: '^\\d{10}$',
        errorMessage: 'Must be a 10-digit phone number',
      });
    }
    if ((data_type === 'integer' || data_type === 'bigint') && !foreignKeys[column_name]) {
      validations.push({
        rule: 'regex',
        value: '^\\d+$',
        errorMessage: 'Must be a whole number',
      });
    }

    let fieldType;
    if (foreignKeys[column_name]) {
      const { refTable, refColumn } = foreignKeys[column_name];
      const options = await fetchSelectOptions(pool, refTable, refColumn);
      fieldType = { type: 'select', options };
    } else if (data_type === 'boolean') {
      fieldType = { type: 'checkbox' };
    } else {
      fieldType = { type: 'input' };
    }

    fields.push({
      label: column_name
        .replace(/_id$/, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      key: column_name,
      alternateMatches: buildAlternateMatches(column_name),
      fieldType,
      example: buildExample(column_name, data_type),
      validations: validations.length > 0 ? validations : undefined,
    });
  }

  return fields;
}

/** Build a CSV template string: header row + one example row. */
export async function buildCsvTemplate(pool, tableName) {
  const columns = await getColumns(pool, tableName);
  const visible = columns.filter((c) => !SKIP_COLUMNS.has(c.column_name));
  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const headers  = visible.map((c) => escape(c.column_name));
  const examples = visible.map((c) => escape(buildExample(c.column_name, c.data_type)));
  return [headers.join(','), examples.join(',')].join('\r\n');
}
