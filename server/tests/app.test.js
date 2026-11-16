import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandlerMiddleware } from '../src/middleware/error-handler.middleware.js';
import { requestIdMiddleware } from '../src/middleware/request-id.middleware.js';
import {
  createRecordingLogger,
  createTestApp,
  VALID_CORRELATION_ID,
  VALID_REQUEST_ID,
} from './helpers/test-app.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Express application', () => {
  it('returns the legacy-compatible health payload with ID headers', async () => {
    const { app, config } = createTestApp();
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      application: 'SyncSphere API',
      status: 'healthy',
      timestamp: expect.any(String),
      version: config.version,
    });
    expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
    expect(response.body).not.toHaveProperty('data');
    expect(response.body).not.toHaveProperty('error');
    expect(response.body).not.toHaveProperty('metadata');
    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
    expect(response.headers['x-correlation-id']).toBe(response.headers['x-request-id']);
  });

  it('returns the shared not-found envelope for unknown routes', async () => {
    const { app, config } = createTestApp();
    const response = await request(app).get('/api/v1/missing');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      data: null,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Route GET /api/v1/missing was not found.',
        details: null,
      },
      metadata: {
        requestId: expect.stringMatching(UUID_PATTERN),
        correlationId: expect.stringMatching(UUID_PATTERN),
        timestamp: expect.any(String),
        version: config.version,
      },
    });
  });

  it('preserves valid client request and correlation IDs', async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .get('/api/v1/missing')
      .set('X-Request-Id', VALID_REQUEST_ID)
      .set('X-Correlation-Id', VALID_CORRELATION_ID);

    expect(response.headers['x-request-id']).toBe(VALID_REQUEST_ID);
    expect(response.headers['x-correlation-id']).toBe(VALID_CORRELATION_ID);
    expect(response.body.metadata.requestId).toBe(VALID_REQUEST_ID);
    expect(response.body.metadata.correlationId).toBe(VALID_CORRELATION_ID);
  });

  it('replaces invalid client IDs and falls back correlation to request ID', async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .get('/api/v1/missing')
      .set('X-Request-Id', 'not-a-uuid')
      .set('X-Correlation-Id', 'also-not-a-uuid');

    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
    expect(response.headers['x-correlation-id']).toBe(response.headers['x-request-id']);
    expect(response.body.metadata.requestId).toBe(response.headers['x-request-id']);
    expect(response.body.metadata.correlationId).toBe(response.headers['x-request-id']);
  });

  it('returns a stable envelope for malformed JSON', async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        data: null,
        error: expect.objectContaining({
          code: 'BAD_REQUEST',
          message: 'Malformed JSON payload.',
        }),
      }),
    );
  });

  it('rejects oversized payloads with the shared error envelope', async () => {
    const { app } = createTestApp({ configOverrides: { BODY_LIMIT: '100b' } });
    const response = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ value: 'x'.repeat(1_000) }));

    expect(response.status).toBe(413);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('does not log query secrets, authorization headers, or request bodies', async () => {
    const { logger, entries } = createRecordingLogger();
    const { app } = createTestApp({ logger });

    await request(app)
      .get('/api/v1/health?password=super-secret')
      .set('Authorization', 'Bearer secret-token');

    const completion = entries.find((entry) => entry.message === 'HTTP request completed');

    expect(completion).toBeDefined();
    expect(completion.payload.path).toBe('/api/v1/health');
    expect(JSON.stringify(entries)).not.toContain('super-secret');
    expect(JSON.stringify(entries)).not.toContain('secret-token');
  });

  it('sanitizes unexpected failures through the centralized handler', async () => {
    const { logger, entries } = createRecordingLogger();
    const app = express();

    app.locals.logger = logger;
    app.locals.appConfig = { version: '1.0.0', isProduction: true };
    app.use(requestIdMiddleware);
    app.get('/boom', () => {
      throw new Error('sensitive internal detail');
    });
    app.use(errorHandlerMiddleware);

    const response = await request(app).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
      details: null,
    });
    expect(JSON.stringify(response.body)).not.toContain('sensitive internal detail');
    expect(entries.some((entry) => entry.level === 'error')).toBe(true);
  });

  it('requires configuration and logger dependencies', async () => {
    const { createApp } = await import('../src/app.js');

    expect(() => createApp({})).toThrow(TypeError);
  });
});
