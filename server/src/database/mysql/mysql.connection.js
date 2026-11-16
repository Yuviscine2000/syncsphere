import mysql from 'mysql2/promise';
import { AppError } from '../../errors/app-error.js';
import { ERROR_CODES } from '../../errors/error-codes.js';
import { createDatabaseError } from '../database-errors.js';
import { checkMysqlHealth } from './mysql.health.js';

/**
 * Creates the configured MySQL connection pool.
 * @param {object} config
 * @param {{ createPool?: typeof mysql.createPool }} [dependencies]
 * @returns {import('mysql2/promise').Pool}
 */
export function createMysqlPool(config, { createPool = mysql.createPool } = {}) {
  return createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: config.connectionLimit,
    connectTimeout: config.connectTimeout,
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    charset: 'utf8mb4',
    ...(config.ssl ? { ssl: { rejectUnauthorized: true } } : {}),
  });
}

/**
 * Executes a parameterized statement through the managed pool.
 * User-supplied values must be passed in the parameters array.
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} sql
 * @param {unknown[]} [parameters]
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ rows: unknown, fields: unknown }>}
 */
export async function executeMysqlQuery(pool, sql, parameters = [], options = {}) {
  if (typeof sql !== 'string' || sql.trim().length === 0) {
    throw new AppError(
      ERROR_CODES.DATABASE_OPERATION_FAILED,
      'A non-empty SQL statement is required.',
    );
  }

  if (!Array.isArray(parameters)) {
    throw new AppError(
      ERROR_CODES.DATABASE_OPERATION_FAILED,
      'Query parameters must be provided as an array.',
    );
  }

  const statement =
    typeof options.timeoutMs === 'number' && options.timeoutMs > 0
      ? { sql, timeout: options.timeoutMs }
      : sql;

  try {
    const [rows, fields] = await pool.execute(statement, parameters);
    return { rows, fields };
  } catch (error) {
    throw createDatabaseError(
      ERROR_CODES.DATABASE_OPERATION_FAILED,
      'MySQL query execution failed.',
      error,
    );
  }
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @returns {Promise<string>}
 */
export async function checkMysqlPoolHealth(pool) {
  return checkMysqlHealth(pool);
}

/**
 * Closes the pool and releases all connections.
 * @param {import('mysql2/promise').Pool} pool
 */
export async function closeMysqlPool(pool) {
  if (pool === null || pool === undefined) {
    return;
  }

  await pool.end();
}
