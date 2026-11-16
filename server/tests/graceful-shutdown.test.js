import { describe, expect, it, vi } from 'vitest';
import { createGracefulShutdown } from '../src/utils/graceful-shutdown.js';
import { createRecordingLogger } from './helpers/test-app.js';

function createServer({ closeError = null, neverClose = false } = {}) {
  return {
    close: vi.fn((callback) => {
      if (neverClose) {
        return;
      }

      callback(closeError);
    }),
    closeAllConnections: vi.fn(),
  };
}

describe('graceful shutdown', () => {
  it('closes the HTTP server and exits successfully', async () => {
    const server = createServer();
    const { logger, entries } = createRecordingLogger();
    const exit = vi.fn();
    const graceful = createGracefulShutdown({
      server,
      logger,
      timeoutMs: 1_000,
      exit,
    });

    const result = await graceful.shutdown('SIGTERM');

    expect(result).toBe(0);
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(entries.map((entry) => entry.message)).toContain('Graceful shutdown completed');
    graceful.removeSignalHandlers();
  });

  it('exits with failure when the server cannot close cleanly', async () => {
    const server = createServer({ closeError: new Error('close failed') });
    const { logger } = createRecordingLogger();
    const exit = vi.fn();
    const graceful = createGracefulShutdown({
      server,
      logger,
      timeoutMs: 1_000,
      exit,
    });

    const result = await graceful.shutdown('SIGINT');

    expect(result).toBe(1);
    expect(exit).toHaveBeenCalledWith(1);
    graceful.removeSignalHandlers();
  });

  it('forces exit and closes connections when shutdown times out', async () => {
    vi.useFakeTimers();
    const server = createServer({ neverClose: true });
    const { logger } = createRecordingLogger();
    const exit = vi.fn();
    const graceful = createGracefulShutdown({
      server,
      logger,
      timeoutMs: 1_000,
      exit,
    });

    const resultPromise = graceful.shutdown('timeout-test');
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await resultPromise;

    expect(result).toBe(1);
    expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    graceful.removeSignalHandlers();
    vi.useRealTimers();
  });

  it('closes HTTP before shutting down resources', async () => {
    const events = [];
    const server = {
      close: vi.fn((callback) => {
        events.push('http');
        callback();
      }),
      closeAllConnections: vi.fn(),
    };
    const { logger } = createRecordingLogger();
    const exit = vi.fn(() => {
      events.push('exit');
    });
    const graceful = createGracefulShutdown({
      server,
      logger,
      timeoutMs: 1_000,
      exit,
      shutdownResources: async () => {
        events.push('resources');
      },
    });

    await expect(graceful.shutdown('SIGTERM')).resolves.toBe(0);

    expect(events).toEqual(['http', 'resources', 'exit']);
    graceful.removeSignalHandlers();
  });

  it('exits with failure when resource shutdown fails', async () => {
    const server = createServer();
    const { logger } = createRecordingLogger();
    const exit = vi.fn();
    const graceful = createGracefulShutdown({
      server,
      logger,
      timeoutMs: 1_000,
      exit,
      shutdownResources: async () => {
        throw new Error('database close failed');
      },
    });

    await expect(graceful.shutdown('SIGTERM')).resolves.toBe(1);

    expect(exit).toHaveBeenCalledWith(1);
    graceful.removeSignalHandlers();
  });

  it('ignores duplicate shutdown requests', async () => {
    const server = createServer();
    const { logger } = createRecordingLogger();
    const exit = vi.fn();
    const graceful = createGracefulShutdown({
      server,
      logger,
      timeoutMs: 1_000,
      exit,
    });

    const first = graceful.shutdown('first');
    const second = graceful.shutdown('second');

    await expect(first).resolves.toBe(0);
    await expect(second).resolves.toBe(0);
    expect(server.close).toHaveBeenCalledTimes(1);
    graceful.removeSignalHandlers();
  });
});
