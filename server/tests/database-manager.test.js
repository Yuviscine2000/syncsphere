import { describe, expect, it, vi } from 'vitest';
import {
  DATABASE_DEPENDENCY_NAMES,
  DATABASE_STATUS,
} from '../src/constants/database.constants.js';
import { createDatabaseManager } from '../src/database/database-manager.js';
import { createRecordingLogger } from './helpers/test-app.js';

function createDatabaseConfig({
  startupPolicy = 'optional',
  connectTimeoutMs = 50,
} = {}) {
  return {
    startupPolicy,
    connectTimeoutMs,
    requiredDependencies:
      startupPolicy === 'required' ? [...DATABASE_DEPENDENCY_NAMES] : [],
    optionalDependencies:
      startupPolicy === 'optional' ? [...DATABASE_DEPENDENCY_NAMES] : [],
    mysql: {},
    mongodb: {},
    redis: {},
  };
}

function createMockClient(name, {
  configured = true,
  initializeError = null,
  health = DATABASE_STATUS.CONNECTED,
  healthCheck = null,
  order = [],
} = {}) {
  let status = configured
    ? DATABASE_STATUS.NOT_INITIALIZED
    : DATABASE_STATUS.NOT_CONFIGURED;

  return {
    name,
    isConfigured: configured,
    initialize: vi.fn(async () => {
      order.push(`initialize:${name}`);

      if (initializeError !== null) {
        status = DATABASE_STATUS.UNAVAILABLE;
        throw initializeError;
      }

      status = DATABASE_STATUS.CONNECTED;
      return status;
    }),
    checkHealth: vi.fn(healthCheck ?? (async () => health)),
    getStatus: () => status,
    close: vi.fn(async () => {
      order.push(`close:${name}`);
      status = DATABASE_STATUS.CLOSED;
    }),
  };
}

function createClients(options = {}, order = []) {
  return Object.fromEntries(
    DATABASE_DEPENDENCY_NAMES.map((name) => [
      name,
      createMockClient(name, { ...options[name], order }),
    ]),
  );
}

describe('database manager', () => {
  it('initializes dependencies in order and is idempotent', async () => {
    const order = [];
    const clients = createClients({}, order);
    const { logger } = createRecordingLogger();
    const manager = createDatabaseManager({
      databaseConfig: createDatabaseConfig({ startupPolicy: 'required' }),
      logger,
      clients,
    });

    const summary = await manager.initialize();

    expect(order).toEqual([
      'initialize:mysql',
      'initialize:mongodb',
      'initialize:redis',
    ]);
    expect(summary.status).toBe(DATABASE_STATUS.CONNECTED);
    expect(summary.dependencies).toEqual({
      mysql: DATABASE_STATUS.CONNECTED,
      mongodb: DATABASE_STATUS.CONNECTED,
      redis: DATABASE_STATUS.CONNECTED,
    });

    await manager.initialize();
    expect(order.filter((entry) => entry.startsWith('initialize:'))).toHaveLength(3);
  });

  it('continues optional startup when a configured dependency fails', async () => {
    const order = [];
    const clients = createClients(
      {
        mongodb: {
          initializeError: new Error('mongodb offline'),
          health: DATABASE_STATUS.UNAVAILABLE,
        },
      },
      order,
    );
    const { logger, entries } = createRecordingLogger();
    const manager = createDatabaseManager({
      databaseConfig: createDatabaseConfig({ startupPolicy: 'optional' }),
      logger,
      clients,
    });

    const summary = await manager.initialize();
    const readiness = await manager.checkReadiness();

    expect(summary.status).toBe(DATABASE_STATUS.UNAVAILABLE);
    expect(summary.dependencies.mongodb).toBe(DATABASE_STATUS.UNAVAILABLE);
    expect(readiness).toEqual({
      status: 'ready',
      dependencies: {
        mysql: DATABASE_STATUS.CONNECTED,
        mongodb: DATABASE_STATUS.UNAVAILABLE,
        redis: DATABASE_STATUS.CONNECTED,
      },
      requiredDependencies: [],
      optionalDependencies: [...DATABASE_DEPENDENCY_NAMES],
    });
    expect(entries.some((entry) => entry.level === 'error')).toBe(true);
  });

  it('fails required startup and cleans up every dependency', async () => {
    const order = [];
    const clients = createClients(
      { redis: { initializeError: new Error('redis offline') } },
      order,
    );
    const { logger } = createRecordingLogger();
    const manager = createDatabaseManager({
      databaseConfig: createDatabaseConfig({ startupPolicy: 'required' }),
      logger,
      clients,
    });

    await expect(manager.initialize()).rejects.toMatchObject({
      code: 'DATABASE_INITIALIZATION_FAILED',
    });

    expect(order).toEqual([
      'initialize:mysql',
      'initialize:mongodb',
      'initialize:redis',
      'close:redis',
      'close:mongodb',
      'close:mysql',
    ]);
    expect(manager.getStatus()).toBe(DATABASE_STATUS.CLOSED);
  });

  it('reports not_ready when any required dependency is unavailable', async () => {
    const clients = createClients({
      mongodb: { health: DATABASE_STATUS.UNAVAILABLE },
    });
    const { logger } = createRecordingLogger();
    const manager = createDatabaseManager({
      databaseConfig: createDatabaseConfig({ startupPolicy: 'required' }),
      logger,
      clients,
    });

    const readiness = await manager.checkReadiness();

    expect(readiness.status).toBe('not_ready');
    expect(readiness.requiredDependencies).toEqual([...DATABASE_DEPENDENCY_NAMES]);
    expect(readiness.dependencies.mongodb).toBe(DATABASE_STATUS.UNAVAILABLE);
  });

  it('treats timed-out dependency health checks as unavailable', async () => {
    const clients = createClients({
      mysql: {
        healthCheck: () => new Promise(() => {}),
      },
    });
    const { logger } = createRecordingLogger();
    const manager = createDatabaseManager({
      databaseConfig: createDatabaseConfig({
        startupPolicy: 'optional',
        connectTimeoutMs: 5,
      }),
      logger,
      clients,
    });

    const readiness = await manager.checkReadiness();

    expect(readiness.dependencies.mysql).toBe(DATABASE_STATUS.UNAVAILABLE);
  });

  it('shuts dependencies down in reverse order and is idempotent', async () => {
    const order = [];
    const clients = createClients({}, order);
    const { logger } = createRecordingLogger();
    const manager = createDatabaseManager({
      databaseConfig: createDatabaseConfig({ startupPolicy: 'required' }),
      logger,
      clients,
    });

    await manager.initialize();
    await manager.shutdown();
    await manager.shutdown();

    expect(order.filter((entry) => entry.startsWith('close:'))).toEqual([
      'close:redis',
      'close:mongodb',
      'close:mysql',
    ]);
    expect(manager.getStatus()).toBe(DATABASE_STATUS.CLOSED);
  });

  it('exposes managed clients for future repositories', () => {
    const clients = createClients();
    const { logger } = createRecordingLogger();
    const manager = createDatabaseManager({
      databaseConfig: createDatabaseConfig(),
      logger,
      clients,
    });

    expect(manager.getClient('mysql')).toBe(clients.mysql);
    expect(manager.getClient('missing')).toBeNull();
    expect(manager.getClients()).toBe(clients);
  });
});
