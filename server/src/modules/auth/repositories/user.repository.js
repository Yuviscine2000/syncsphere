import { AppError } from '../../../errors/app-error.js';
import { ERROR_CODES } from '../../../errors/error-codes.js';

function toIsoString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return new Date(value).toISOString();
}

function mapUser(row) {
  return {
    id: Number(row.id),
    email: row.email,
    passwordHash: row.password_hash,
    fullName: row.full_name,
    status: row.status,
    lastLoginAt: toIsoString(row.last_login_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapAuthorizationRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const first = rows[0];
  const roles = new Set();
  const permissions = new Set();

  for (const row of rows) {
    if (typeof row.role_name === 'string' && row.role_name.length > 0) {
      roles.add(row.role_name);
    }

    if (typeof row.permission_name === 'string' && row.permission_name.length > 0) {
      permissions.add(row.permission_name);
    }
  }

  return {
    id: Number(first.id),
    email: first.email,
    fullName: first.full_name,
    status: first.status,
    lastLoginAt: toIsoString(first.last_login_at),
    createdAt: toIsoString(first.created_at),
    roles: [...roles].sort(),
    permissions: [...permissions].sort(),
  };
}

/**
 * Creates the MySQL-backed user and authorization repository.
 * @param {{ getMysqlClient: () => object }} options
 * @returns {object}
 */
export function createUserRepository({ getMysqlClient }) {
  async function findByEmail(email) {
    const result = await getMysqlClient().query(
      `SELECT id, email, password_hash, full_name, status, last_login_at, created_at, updated_at
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email],
    );

    const row = result.rows[0];
    return row === undefined ? null : mapUser(row);
  }

  async function findByIdWithAuthorization(userId, queryable = null) {
    const executor = queryable ?? getMysqlClient();
    const result = await executor.query(
      `SELECT u.id, u.email, u.full_name, u.status, u.last_login_at, u.created_at,
              r.name AS role_name, p.name AS permission_name
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE u.id = ?
       ORDER BY r.name, p.name`,
      [userId],
    );

    return mapAuthorizationRows(result.rows);
  }

  async function createUser({ email, passwordHash, fullName, roleName }) {
    return getMysqlClient().withTransaction(async (transaction) => {
      const insertResult = await transaction.query(
        `INSERT INTO users (email, password_hash, full_name)
         VALUES (?, ?, ?)`,
        [email, passwordHash, fullName],
      );

      const userId = Number(insertResult.rows.insertId);

      if (!Number.isSafeInteger(userId) || userId < 1) {
        throw new AppError(
          ERROR_CODES.DATABASE_OPERATION_FAILED,
          'The user record could not be created.',
        );
      }

      const roleResult = await transaction.query(
        'SELECT id FROM roles WHERE name = ? LIMIT 1',
        [roleName],
      );
      const role = roleResult.rows[0];

      if (role === undefined) {
        throw new AppError(
          ERROR_CODES.SERVICE_UNAVAILABLE,
          'Authentication roles are not provisioned.',
        );
      }

      await transaction.query(
        'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
        [userId, role.id],
      );

      return { userId };
    });
  }

  async function updateLastLogin(userId) {
    await getMysqlClient().query(
      'UPDATE users SET last_login_at = UTC_TIMESTAMP(3) WHERE id = ?',
      [userId],
    );
  }

  return {
    findByEmail,
    findByIdWithAuthorization,
    createUser,
    updateLastLogin,
  };
}
