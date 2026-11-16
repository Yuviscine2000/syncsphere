import { AppError } from '../../errors/app-error.js';
import { ERROR_CODES } from '../../errors/error-codes.js';
import { createAuthCache } from '../../security/auth-cache.service.js';
import { createCsrfService } from '../../security/csrf.service.js';
import { createPasswordService } from '../../security/password.service.js';
import { createTokenService } from '../../security/token.service.js';
import { createAuthService } from './auth.service.js';
import { createAuthAuditLogger } from './auth.audit.js';
import { createSessionRepository } from './repositories/session.repository.js';
import { createUserRepository } from './repositories/user.repository.js';

/**
 * Builds the default authentication service from the managed database clients.
 * A missing/unconfigured MySQL dependency fails requests with the shared
 * database-unavailable error instead of crashing application startup.
 * @param {{
 *   config: object,
 *   logger: import('pino').Logger,
 *   databaseManager?: object|null,
 * }} options
 * @returns {object}
 */
export function createDefaultAuthService({ config, logger, databaseManager = null }) {
  function getMysqlClient() {
    const client = databaseManager?.getClient?.('mysql');

    if (client === null || client === undefined) {
      throw new AppError(
        ERROR_CODES.DATABASE_UNAVAILABLE,
        'MySQL is required for authentication.',
      );
    }

    return client;
  }

  const userRepository = createUserRepository({ getMysqlClient });
  const sessionRepository = createSessionRepository({ getMysqlClient });
  const passwordService = createPasswordService(config);
  const tokenService = createTokenService(config);
  const csrfService = createCsrfService(config);
  const audit = createAuthAuditLogger({ logger });
  const cache = createAuthCache({ databaseManager, logger });

  return createAuthService({
    config,
    userRepository,
    sessionRepository,
    passwordService,
    tokenService,
    csrfService,
    audit,
    cache,
    runInTransaction: (work) => getMysqlClient().withTransaction(work),
  });
}
