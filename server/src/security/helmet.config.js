import helmet from 'helmet';

/**
 * Applies conservative HTTP security headers suitable for a JSON API.
 * @returns {import('express').RequestHandler}
 */
export function createHelmetMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
}
