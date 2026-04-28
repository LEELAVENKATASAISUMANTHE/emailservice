/**
 * Student-specific import service.
 * Creates PostgreSQL user accounts with bcrypt-hashed passwords
 * and links them to the students table via student_users.
 */
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { storeTempPassword } from './importLog.service.js';

const PASSWORD_CHARS =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!';

function generatePassword(length = 12) {
  const bytes = crypto.randomBytes(length);
  let pwd = '';
  for (let i = 0; i < length; i++) {
    pwd += PASSWORD_CHARS[bytes[i] % PASSWORD_CHARS.length];
  }
  return pwd;
}

function buildUsername(fullName) {
  if (!fullName) return null;
  const n = String(fullName).trim().toLowerCase();
  return n.length > 0 ? n : null;
}

/**
 * Import student rows with automatic user-account creation.
 * Each student gets:
 *   - A row in `students`
 *   - A row in `users` (email + bcrypt password)
 *   - A row in `student_users` linking both
 *   - A temp password stored in MongoDB (expires 24 h)
 *
 * @returns {{ inserted, failed, errors, usersCreated }}
 */
export async function studentBulkImport(pool, rows, filename = null, importId = null) {
  if (!rows || rows.length === 0) {
    return { inserted: 0, failed: 0, errors: [], usersCreated: 0 };
  }

  const columns = Object.keys(rows[0] || {});
  if (columns.length === 0) {
    return { inserted: 0, failed: 0, errors: [], usersCreated: 0 };
  }

  // Resolve student role ID
  const { rows: roleRows } = await pool.query(
    `SELECT role_id FROM roles WHERE role_name ILIKE 'student' LIMIT 1`
  );
  if (roleRows.length === 0) {
    throw new Error('Student role not found in roles table');
  }
  const studentRoleId = roleRows[0].role_id;

  const errors = [];
  let inserted = 0;
  let duplicates = 0;
  let usersCreated = 0;

  function formatRowError(err) {
    let errorMsg = err.message;

    if (err.code === '23503') {
      const match = err.detail?.match(/Key \((.+)\)=\((.+)\) is not present/);
      if (match) {
        errorMsg = `Foreign key violation: ${match[1]} "${match[2]}" does not exist`;
      } else {
        errorMsg = 'Foreign key violation: referenced record does not exist';
      }
    }

    if (err.code === '23505') {
      errorMsg = 'Duplicate entry: this record already exists';
    }

    return errorMsg;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const values = columns.map((c) => {
        const v = row[c];
        if (v === '' || v === undefined || v === null || v === 'null' || v === 'undefined') {
          return null;
        }
        return v;
      });

      const colList      = columns.map((c) => `"${c}"`).join(', ');
      const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
      const insertStudentSql = `
        INSERT INTO students (${colList})
        VALUES (${placeholders})
        ON CONFLICT DO NOTHING
        RETURNING student_id, college_email, full_name
      `;

      try {
        await client.query('SAVEPOINT sp');

        const result = await client.query(insertStudentSql, values);

        if (result.rowCount === 0) {
          await client.query('RELEASE SAVEPOINT sp');
          duplicates++;
          continue;
        }

        const { student_id: studentId, college_email: email, full_name: fullName } =
          result.rows[0];
        const username = buildUsername(fullName) || studentId?.toLowerCase();

        if (email && studentId) {
          const password     = generatePassword(12);
          const passwordHash = await bcrypt.hash(password, 10);

          const userInsert = await client.query(
            `INSERT INTO users (username, email, password_hash, role_id, must_change_password)
             VALUES ($1, $2, $3, $4, true)
             ON CONFLICT (email) DO NOTHING
             RETURNING user_id`,
            [username, email, passwordHash, studentRoleId]
          );

          let userId      = null;
          let userCreated = false;

          if (userInsert.rows.length > 0) {
            userId      = userInsert.rows[0].user_id;
            userCreated = true;
          } else {
            const existing = await client.query(
              `SELECT user_id FROM users WHERE email = $1`,
              [email]
            );
            if (existing.rows.length > 0) userId = existing.rows[0].user_id;
          }

          if (userId) {
            await client.query(
              `INSERT INTO student_users (student_id, user_id)
               VALUES ($1, $2)
               ON CONFLICT (student_id) DO NOTHING`,
              [studentId, userId]
            );
          }

          if (userCreated && importId) {
            await storeTempPassword({ importId, studentId, email, username, password }).catch(
              (err) =>
                console.warn('[importer] failed to store temp password:', err.message)
            );
            usersCreated++;
          }
        }

        await client.query('RELEASE SAVEPOINT sp');
        inserted++;
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT sp');
        errors.push({ rowIndex: i + 1, rowData: row, error: formatRowError(err) });
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const failed = errors.length;

  await pool
    .query(
      `INSERT INTO import_logs (table_name, total_rows, success_rows, failed_rows, filename)
       VALUES ($1, $2, $3, $4, $5)`,
      ['students', rows.length, inserted, failed, filename]
    )
    .catch((err) =>
      console.error('[importer] failed to write import_log:', err.message)
    );

  return { inserted, failed, duplicates, errors, usersCreated };
}
