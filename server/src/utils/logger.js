import pino from 'pino';

/**
 * Creates the structured application logger.
 * @param {{ logLevel: string, nodeEnv: string }} config
 * @returns {import('pino').Logger}
 */
export function createLogger(config) {
  return pino({
    level: config.logLevel,
    base: {
      service: 'syncsphere-api',
      environment: config.nodeEnv,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'password',
        'passwordHash',
        'token',
        'accessToken',
        'refreshToken',
        'csrfToken',
        'secret',
        'authorization',
        'cookie',
        'set-cookie',
        '*.password',
        '*.passwordHash',
        '*.token',
        '*.accessToken',
        '*.refreshToken',
        '*.csrfToken',
        '*.secret',
        '*.authorization',
        '*.cookie',
        '*.set-cookie',
      ],
      censor: '[redacted]',
    },
  });
}
