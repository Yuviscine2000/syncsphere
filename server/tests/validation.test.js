import express from 'express';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandlerMiddleware } from '../src/middleware/error-handler.middleware.js';
import { requestIdMiddleware } from '../src/middleware/request-id.middleware.js';
import { validateRequest } from '../src/middleware/validate-request.middleware.js';
import { createRecordingLogger } from './helpers/test-app.js';
import { request } from './helpers/test-request.js';

function createValidationApp() {
  const { logger } = createRecordingLogger();
  const app = express();

  app.locals.logger = logger;
  app.locals.appConfig = { version: '1.0.0', isProduction: false };
  app.use(requestIdMiddleware);
  app.use(express.json());

  app.post(
    '/validate',
    validateRequest({
      body: z.object({ name: z.string().min(2) }),
      query: z.object({ page: z.coerce.number().int().min(1) }),
    }),
    (req, res) => {
      res.status(200).json({ success: true, data: req.validated, error: null });
    },
  );

  app.use(errorHandlerMiddleware);

  return app;
}

describe('request validation middleware', () => {
  it('stores parsed body and query values on request.validated', async () => {
    const response = await request(createValidationApp())
      .post('/validate?page=2')
      .send({ name: 'Ada', ignored: true });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      body: { name: 'Ada' },
      query: { page: 2 },
    });
  });

  it('returns field-level validation details in the shared envelope', async () => {
    const response = await request(createValidationApp())
      .post('/validate?page=0')
      .send({ name: 'A' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'body', field: 'name' }),
        expect.objectContaining({ source: 'query', field: 'page' }),
      ]),
    );
  });

  it('rejects unsupported validation sources', () => {
    expect(() => validateRequest({ headers: z.object({}) })).toThrow(TypeError);
  });

  it('rejects values that are not Zod schemas', () => {
    expect(() => validateRequest({ body: {} })).toThrow(TypeError);
  });
});
