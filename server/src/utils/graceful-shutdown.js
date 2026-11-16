/**
 * Coordinates graceful HTTP shutdown and a bounded forced-exit fallback.
 * @param {{
 *   server: import('node:http').Server,
 *   logger: import('pino').Logger,
 *   timeoutMs: number,
 *   exit?: (code: number) => void,
 *   shutdownResources?: () => Promise<void>,
 *   sanitizeError?: (error: unknown) => unknown,
 * }} options
 * @returns {{ shutdown: (signal?: string) => Promise<number>, removeSignalHandlers: () => void }}
 */
export function createGracefulShutdown({
  server,
  logger,
  timeoutMs,
  exit = process.exit,
  shutdownResources,
  sanitizeError = (error) => error,
}) {
  let shuttingDown = false;

  const shutdown = (signal = 'manual') => {
    if (shuttingDown) {
      return Promise.resolve(0);
    }

    shuttingDown = true;
    logger.info({ signal, timeoutMs }, 'Graceful shutdown started');

    return new Promise((resolve) => {
      let finished = false;

      const complete = async (exitCode) => {
        if (finished) {
          return;
        }

        let finalExitCode = exitCode;

        if (typeof shutdownResources === 'function') {
          try {
            await shutdownResources();
          } catch (error) {
            logger.error({ err: sanitizeError(error) }, 'Resource shutdown failed');
            finalExitCode = 1;
          }
        }

        if (finished) {
          return;
        }

        finished = true;
        clearTimeout(forceTimer);
        logger.info({ signal, exitCode: finalExitCode }, 'Graceful shutdown completed');
        exit(finalExitCode);
        resolve(finalExitCode);
      };

      const forceTimer = setTimeout(() => {
        if (finished) {
          return;
        }

        finished = true;
        logger.error({ signal }, 'Graceful shutdown timed out; forcing exit');
        server.closeAllConnections?.();
        exit(1);
        resolve(1);
      }, timeoutMs);

      forceTimer.unref?.();

      server.close((error) => {
        if (error) {
          logger.error({ err: error }, 'HTTP server closed with an error');
          void complete(1);
          return;
        }

        void complete(0);
      });
    });
  };

  const onSigterm = () => {
    void shutdown('SIGTERM');
  };
  const onSigint = () => {
    void shutdown('SIGINT');
  };

  process.once('SIGTERM', onSigterm);
  process.once('SIGINT', onSigint);

  return {
    shutdown,
    removeSignalHandlers() {
      process.removeListener('SIGTERM', onSigterm);
      process.removeListener('SIGINT', onSigint);
    },
  };
}
