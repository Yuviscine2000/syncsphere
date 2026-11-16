import { z } from 'zod';
import { loadConfig } from '../src/config/index.js';
import { AUTH_ROLES } from '../src/constants/auth.constants.js';
import { createDatabaseManager } from '../src/database/database-manager.js';
import {
  getDatabaseSecrets,
  sanitizeDatabaseError,
} from '../src/database/database-errors.js';
import { assertPasswordPolicy } from '../src/security/password-policy.js';
import { createPasswordService } from '../src/security/password.service.js';
import { createLogger } from '../src/utils/logger.js';
import { containsControlCharacters } from '../src/utils/text.js';

const emailSchema = z
  .string()
  .trim()
  .max(320)
  .email()
  .transform((value) => value.toLowerCase());
const fullNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .refine((value) => !containsControlCharacters(value), {
    message: 'Full name contains invalid characters.',
  });

function readProvisioningInput(config) {
  if (process.env.ADMIN_PROVISION_CONFIRM !== 'YES') {
    throw new Error(
      'Set ADMIN_PROVISION_CONFIRM=YES to confirm initial administrator provisioning.',
    );
  }

  const emailResult = emailSchema.safeParse(process.env.ADMIN_EMAIL ?? '');
  const fullNameResult = fullNameSchema.safeParse(process.env.ADMIN_FULL_NAME ?? '');

  if (!emailResult.success) {
    throw new Error('ADMIN_EMAIL must be a valid email address.');
  }

  if (!fullNameResult.success) {
    throw new Error('ADMIN_FULL_NAME must be between 2 and 120 valid characters.');
  }

  return {
    email: emailResult.data,
    fullName: fullNameResult.data,
    password: assertPasswordPolicy(process.env.ADMIN_PASSWORD ?? '', config),
  };
}

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  const input = readProvisioningInput(config);
  const passwordService = createPasswordService(config);
  const passwordHash = await passwordService.hashPassword(input.password);
  const databaseManager = createDatabaseManager({
    databaseConfig: config.database,
    logger,
  });

  try {
    await databaseManager.initialize();
    const mysqlClient = databaseManager.getClient('mysql');

    if (mysqlClient === null || mysqlClient.isConfigured !== true) {
      throw new Error('MySQL must be configured before provisioning an administrator.');
    }

    const userId = await mysqlClient.withTransaction(async (transaction) => {
      const roleResult = await transaction.query(
        'SELECT id FROM roles WHERE name = ? LIMIT 1',
        [AUTH_ROLES.SUPER_ADMIN],
      );
      const role = roleResult.rows[0];

      if (role === undefined) {
        throw new Error('Run the authentication migrations before provisioning an administrator.');
      }

      const userResult = await transaction.query(
        'SELECT id FROM users WHERE email = ? LIMIT 1 FOR UPDATE',
        [input.email],
      );
      const existing = userResult.rows[0];
      let resolvedUserId;

      if (existing === undefined) {
        const insertResult = await transaction.query(
          `INSERT INTO users (email, password_hash, full_name, status)
           VALUES (?, ?, ?, 'active')`,
          [input.email, passwordHash, input.fullName],
        );
        resolvedUserId = Number(insertResult.rows.insertId);
      } else {
        resolvedUserId = Number(existing.id);
        await transaction.query(
          `UPDATE users
           SET password_hash = ?, full_name = ?, status = 'active',
               updated_at = UTC_TIMESTAMP(3)
           WHERE id = ?`,
          [passwordHash, input.fullName, resolvedUserId],
        );
      }

      await transaction.query(
        'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
        [resolvedUserId, role.id],
      );

      await transaction.query(
        `UPDATE refresh_sessions
         SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP(3))
         WHERE user_id = ? AND revoked_at IS NULL`,
        [resolvedUserId],
      );

      return resolvedUserId;
    });

    logger.info(
      { userId, role: AUTH_ROLES.SUPER_ADMIN },
      'Initial administrator provisioning completed',
    );
  } catch (error) {
    logger.fatal(
      { err: sanitizeDatabaseError(error, getDatabaseSecrets(config.database)) },
      'Initial administrator provisioning failed',
    );
    process.exitCode = 1;
  } finally {
    try {
      await databaseManager.shutdown();
    } catch (error) {
      logger.warn(
        { err: sanitizeDatabaseError(error, getDatabaseSecrets(config.database)) },
        'Database shutdown after administrator provisioning failed',
      );
    }
  }
}

void main();
