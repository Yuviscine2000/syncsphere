import { DATABASE_STATUS } from '../../constants/database.constants.js';

/**
 * Performs a lightweight MySQL connectivity check.
 * @param {import('mysql2/promise').Pool} pool
 * @returns {Promise<string>}
 */
export async function checkMysqlHealth(pool) {
  try {
    const [rows] = await pool.query('SELECT 1 AS healthy');
    return Array.isArray(rows) && rows[0]?.healthy === 1
      ? DATABASE_STATUS.CONNECTED
      : DATABASE_STATUS.UNAVAILABLE;
  } catch {
    return DATABASE_STATUS.UNAVAILABLE;
  }
}
