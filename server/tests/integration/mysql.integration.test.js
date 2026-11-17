import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isDuplicateKeyError } from '../../src/database/database-errors.js';
import {
  closeIntegrationDatabase,
  createIntegrationDatabase,
  initializeIntegrationDatabase,
} from './support/integration-database.js';
import { uniqueEmail, uniqueName } from './support/unique-values.js';

describe('real MySQL integration', () => {
  let context;
  let mysql;
  const createdEmails = new Set();
  const createdRoles = new Set();

  beforeAll(async () => {
    context = createIntegrationDatabase();
    await initializeIntegrationDatabase(context, { migrate: true });
    mysql = context.databaseManager.getClient('mysql');
  });

  afterAll(async () => {
    if (mysql !== undefined) {
      for (const email of createdEmails) {
        await mysql.query('DELETE FROM users WHERE email = ?', [email]).catch(() => {});
      }

      for (const roleName of createdRoles) {
        await mysql.query('DELETE FROM roles WHERE name = ?', [roleName]).catch(() => {});
      }
    }

    if (context !== undefined) {
      await closeIntegrationDatabase(context);
    }
  });

  it('applies the auth migrations and seed data', async () => {
    const migrations = await mysql.query('SELECT name FROM schema_migrations ORDER BY name');
    const names = migrations.rows.map((row) => row.name);

    expect(names).toContain('001_auth_schema');
    expect(names).toContain('002_auth_seed');

    const role = await mysql.query('SELECT id, name FROM roles WHERE name = ? LIMIT 1', ['USER']);
    expect(role.rows).toHaveLength(1);
  });

  it('acquires and releases a real pool connection', async () => {
    const pool = mysql.getDriverClient();
    const connection = await pool.getConnection();

    try {
      const [rows] = await connection.query('SELECT 1 AS healthy');
      expect(rows[0].healthy).toBe(1);
    } finally {
      connection.release();
    }

    const result = await mysql.query('SELECT 1 AS healthy');
    expect(result.rows[0].healthy).toBe(1);
  });

  it('performs parameterized create, read, update, and delete operations', async () => {
    const email = uniqueEmail('mysql-crud');
    createdEmails.add(email);

    const insert = await mysql.query(
      'INSERT INTO users (email, password_hash, full_name) VALUES (?, ?, ?)',
      [email, 'integration-password-hash', 'MySQL Integration User'],
    );
    const userId = Number(insert.rows.insertId);

    expect(Number.isSafeInteger(userId)).toBe(true);

    const selected = await mysql.query(
      'SELECT id, email, full_name FROM users WHERE email = ? LIMIT 1',
      [email],
    );
    expect(selected.rows[0].email).toBe(email);

    await mysql.query('UPDATE users SET full_name = ? WHERE id = ?', [
      'MySQL Updated User',
      userId,
    ]);
    const updated = await mysql.query('SELECT full_name FROM users WHERE id = ?', [userId]);
    expect(updated.rows[0].full_name).toBe('MySQL Updated User');

    const deleted = await mysql.query('DELETE FROM users WHERE id = ?', [userId]);
    expect(deleted.rows.affectedRows).toBe(1);
    createdEmails.delete(email);
  });

  it('commits a transaction and rolls back a failed transaction', async () => {
    const committedRole = uniqueName('mysql_committed_role');
    const rolledBackRole = uniqueName('mysql_rolled_back_role');
    createdRoles.add(committedRole);
    createdRoles.add(rolledBackRole);

    await mysql.withTransaction(async (transaction) => {
      await transaction.query('INSERT INTO roles (name, description) VALUES (?, ?)', [
        committedRole,
        'Committed integration role',
      ]);
    });

    const committed = await mysql.query('SELECT id FROM roles WHERE name = ?', [committedRole]);
    expect(committed.rows).toHaveLength(1);

    await expect(
      mysql.withTransaction(async (transaction) => {
        await transaction.query('INSERT INTO roles (name, description) VALUES (?, ?)', [
          rolledBackRole,
          'Rolled back integration role',
        ]);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow();

    const rolledBack = await mysql.query('SELECT id FROM roles WHERE name = ?', [rolledBackRole]);
    expect(rolledBack.rows).toHaveLength(0);
  });

  it('enforces duplicate-key and foreign-key constraints', async () => {
    const email = uniqueEmail('mysql-constraints');
    createdEmails.add(email);

    await mysql.query('INSERT INTO users (email, password_hash, full_name) VALUES (?, ?, ?)', [
      email,
      'integration-password-hash',
      'Constraint User',
    ]);

    let duplicateError;
    try {
      await mysql.query('INSERT INTO users (email, password_hash, full_name) VALUES (?, ?, ?)', [
        email,
        'integration-password-hash',
        'Duplicate User',
      ]);
    } catch (error) {
      duplicateError = error;
    }
    expect(isDuplicateKeyError(duplicateError)).toBe(true);

    const role = await mysql.query('SELECT id FROM roles WHERE name = ? LIMIT 1', ['USER']);
    let foreignKeyError;
    try {
      await mysql.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [
        9_999_999_999,
        role.rows[0].id,
      ]);
    } catch (error) {
      foreignKeyError = error;
    }

    expect(String(foreignKeyError?.cause?.code ?? foreignKeyError?.code)).toMatch(
      /ER_NO_REFERENCED_ROW/,
    );
  });
});
