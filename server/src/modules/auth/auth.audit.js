import { AUTH_AUDIT_OUTCOMES } from '../../constants/auth.constants.js';

/**
 * Emits structured authentication audit events without credentials, tokens,
 * cookies, email addresses, or password material.
 * @param {{ logger: import('pino').Logger }} options
 * @returns {function(object): void}
 */
export function createAuthAuditLogger({ logger }) {
  return function audit({
    event,
    outcome = AUTH_AUDIT_OUTCOMES.SUCCESS,
    userId = null,
    requestId = null,
    correlationId = null,
    reason = null,
  }) {
    const payload = {
      event,
      outcome,
      userId,
      requestId,
      correlationId,
      reason,
    };

    if (outcome === AUTH_AUDIT_OUTCOMES.FAILURE) {
      logger.warn(payload, 'Authentication audit event');
      return;
    }

    logger.info(payload, 'Authentication audit event');
  };
}
