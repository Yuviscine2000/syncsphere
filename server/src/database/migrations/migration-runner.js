import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATION_LOCK_NAME = 'syncsphere_schema_migrations';
const MIGRATION_LOCK_TIMEOUT_SECONDS = 10;

/**
 * Splits a migration file into individual statements while respecting quoted
 * strings, quoted identifiers, and SQL comments.
 * @param {string} sql
 * @returns {string[]}
 */
export function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let quote = null;
  let escaped = false;
  let index = 0;

  while (index < sql.length) {
    const character = sql[index];
    const next = sql[index + 1];

    if (quote !== null) {
      current += character;

      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }

      index += 1;
      continue;
    }

    if (character === '-' && next === '-') {
      index += 2;
      while (index < sql.length && sql[index] !== '\n') {
        index += 1;
      }
      continue;
    }

    if (character === '#') {
      index += 1;
      while (index < sql.length && sql[index] !== '\n') {
        index += 1;
      }
      continue;
    }

    if (character === '/' && next === '*') {
      index += 2;
      while (index < sql.length && !(sql[index] === '*' && sql[index + 1] === '/')) {
        index += 1;
      }
      index += 2;
      continue;
    }

    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      current += character;
      index += 1;
      continue;
    }

    if (character === ';') {
      const statement = current.trim();
      if (statement.length > 0) {
        statements.push(statement);
      }
      current = '';
      index += 1;
      continue;
    }

    current += character;
    index += 1;
  }

  const trailing = current.trim();
  if (trailing.length > 0) {
    statements.push(trailing);
  }

  return statements;
}

function migrationName(fileName) {
  return fileName.replace(/\.(up|down)\.sql$/, '');
}

async function listMigrationFiles(direction, migrationsDir) {
  const suffix = `.${direction}.sql`;
  const entries = await readdir(migrationsDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
    .sort();
}

async function ensureMigrationsTable(mysqlClient) {
  await mysqlClient.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       name VARCHAR(255) NOT NULL,
       applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
       PRIMARY KEY (id),
       UNIQUE KEY uq_schema_migrations_name (name)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
}

async function acquireLock(mysqlClient) {
  const result = await mysqlClient.query('SELECT GET_LOCK(?, ?) AS acquired', [
    MIGRATION_LOCK_NAME,
    MIGRATION_LOCK_TIMEOUT_SECONDS,
  ]);

  if (Number(result.rows[0]?.acquired) !== 1) {
    throw new Error('Could not acquire the database migration lock.');
  }
}

async function releaseLock(mysqlClient, logger) {
  try {
    await mysqlClient.query('SELECT RELEASE_LOCK(?)', [MIGRATION_LOCK_NAME]);
  } catch {
    logger.warn('Database migration lock release failed');
  }
}

async function appliedMigrationNames(mysqlClient) {
  const result = await mysqlClient.query('SELECT name FROM schema_migrations ORDER BY name');
  return new Set(result.rows.map((row) => row.name));
}

async function applyUpMigration({ mysqlClient, logger, fileName, migrationsDir }) {
  const name = migrationName(fileName);
  const sql = await readFile(join(migrationsDir, fileName), 'utf8');
  const statements = splitSqlStatements(sql);

  for (const statement of statements) {
    await mysqlClient.query(statement);
  }

  await mysqlClient.query('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
  logger.info({ migration: name, statements: statements.length }, 'Migration applied');
}

async function applyDownMigration({ mysqlClient, logger, fileName, migrationsDir }) {
  const name = migrationName(fileName);
  const sql = await readFile(join(migrationsDir, fileName), 'utf8');
  const statements = splitSqlStatements(sql);

  for (const statement of statements) {
    await mysqlClient.query(statement);
  }

  await mysqlClient.query('DELETE FROM schema_migrations WHERE name = ?', [name]);
  logger.info({ migration: name, statements: statements.length }, 'Migration reverted');
}

/**
 * Applies or reverts ordered SQL migrations under a MySQL advisory lock.
 * @param {{
 *   mysqlClient: object,
 *   logger: import('pino').Logger,
 *   direction?: 'up'|'down',
 *   migrationsDir?: string,
 * }} options
 * @returns {Promise<{ applied: string[], skipped: string[] }>}
 */
export async function runMigrations({
  mysqlClient,
  logger,
  direction = 'up',
  migrationsDir = MIGRATIONS_DIR,
}) {
  if (direction !== 'up' && direction !== 'down') {
    throw new TypeError('Migration direction must be "up" or "down"');
  }

  await ensureMigrationsTable(mysqlClient);
  await acquireLock(mysqlClient);

  try {
    const applied = await appliedMigrationNames(mysqlClient);
    const files = await listMigrationFiles(direction, migrationsDir);
    const orderedFiles = direction === 'up' ? files : [...files].reverse();
    const appliedNames = [];
    const skippedNames = [];

    for (const fileName of orderedFiles) {
      const name = migrationName(fileName);

      if (direction === 'up' && applied.has(name)) {
        skippedNames.push(name);
        continue;
      }

      if (direction === 'down' && !applied.has(name)) {
        skippedNames.push(name);
        continue;
      }

      if (direction === 'up') {
        await applyUpMigration({ mysqlClient, logger, fileName, migrationsDir });
      } else {
        await applyDownMigration({ mysqlClient, logger, fileName, migrationsDir });
      }

      appliedNames.push(name);
    }

    return { applied: appliedNames, skipped: skippedNames };
  } finally {
    await releaseLock(mysqlClient, logger);
  }
}

