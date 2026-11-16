/**
 * Emits one structured completion log per request without logging bodies,
 * credentials, or other sensitive payload data.
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @param {import('express').NextFunction} next
 */
export function requestLoggerMiddleware(request, response, next) {
  const startedAt = process.hrtime.bigint();
  let logged = false;

  const writeLog = (completed) => {
    if (logged) {
      return;
    }

    logged = true;

    const logger = request.app.locals.logger;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const statusCode = completed ? response.statusCode : 499;
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    logger[level](
      {
        requestId: request.requestId,
        correlationId: request.correlationId,
        method: request.method,
        path: request.originalUrl.split('?')[0],
        statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        ip: request.ip,
        userAgent: request.get('user-agent') ?? null,
        aborted: !completed,
      },
      'HTTP request completed',
    );
  };

  response.once('finish', () => writeLog(true));
  response.once('close', () => writeLog(response.writableFinished));

  next();
}
