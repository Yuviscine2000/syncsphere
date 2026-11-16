import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_ORIGIN,
  createTestApp,
} from './helpers/test-app.js';

describe('security middleware', () => {
  it('applies Helmet headers and hides Express', async () => {
    const { app } = createTestApp();
    const response = await request(app).get('/api/v1/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cross-origin-resource-policy']).toBe('same-site');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('allows configured CORS origins', async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', ALLOWED_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-expose-headers']).toContain('X-Request-Id');
  });

  it('answers allowed preflight requests', async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .options('/api/v1/health')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'X-Request-Id, Content-Type');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(response.headers['access-control-allow-methods']).toContain('GET');
    expect(response.headers['access-control-allow-headers']).toContain('X-Request-Id');
  });

  it('rejects unapproved CORS origins with the shared error envelope', async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example');

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns a rate-limit envelope after the configured threshold', async () => {
    const { app } = createTestApp({
      configOverrides: { RATE_LIMIT_WINDOW_MS: '60000', RATE_LIMIT_MAX: '2' },
    });

    const first = await request(app).get('/api/v1/health');
    const second = await request(app).get('/api/v1/health');
    const third = await request(app).get('/api/v1/health');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.body.success).toBe(false);
    expect(third.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
