import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { DATABASE_STATUS } from '../src/constants/database.constants.js';
import { createTestApp } from './helpers/test-app.js';

const READY_PAYLOAD = Object.freeze({
  status: 'ready',
  dependencies: {
    mysql: DATABASE_STATUS.CONNECTED,
    mongodb: DATABASE_STATUS.CONNECTED,
    redis: DATABASE_STATUS.CONNECTED,
  },
  requiredDependencies: ['mysql', 'mongodb', 'redis'],
  optionalDependencies: [],
});

const NOT_READY_PAYLOAD = Object.freeze({
  status: 'not_ready',
  dependencies: {
    mysql: DATABASE_STATUS.CONNECTED,
    mongodb: DATABASE_STATUS.UNAVAILABLE,
    redis: DATABASE_STATUS.CONNECTED,
  },
  requiredDependencies: ['mysql', 'mongodb', 'redis'],
  optionalDependencies: [],
});

describe('database health endpoints', () => {
  it('reports liveness with the shared success envelope', async () => {
    const { app, config } = createTestApp();
    const response = await request(app).get('/api/v1/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'alive',
        uptimeSeconds: expect.any(Number),
      },
      error: null,
      metadata: {
        requestId: expect.any(String),
        correlationId: expect.any(String),
        timestamp: expect.any(String),
        version: config.version,
      },
    });
  });

  it('reports ready dependencies with the shared success envelope', async () => {
    const checkReadiness = vi.fn().mockResolvedValue(READY_PAYLOAD);
    const { app, config } = createTestApp({
      databaseManager: { checkReadiness },
    });
    const response = await request(app).get('/api/v1/health/ready');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(READY_PAYLOAD);
    expect(response.body.error).toBeNull();
    expect(response.body.metadata.version).toBe(config.version);
    expect(checkReadiness).toHaveBeenCalledTimes(1);
  });

  it('returns 503 DATABASE_UNAVAILABLE when a required dependency is unavailable', async () => {
    const { app } = createTestApp({
      databaseManager: {
        checkReadiness: vi.fn().mockResolvedValue(NOT_READY_PAYLOAD),
      },
    });
    const response = await request(app).get('/api/v1/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      data: null,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'One or more required database dependencies are unavailable.',
        details: NOT_READY_PAYLOAD,
      },
      metadata: expect.objectContaining({
        requestId: expect.any(String),
        correlationId: expect.any(String),
        timestamp: expect.any(String),
      }),
    });
  });

  it('returns 503 when no database manager is attached', async () => {
    const { app } = createTestApp();
    const response = await request(app).get('/api/v1/health/ready');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
  });
});
