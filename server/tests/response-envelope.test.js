import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/errors/app-error.js';
import {
  buildErrorResponse,
  buildResponseMetadata,
  buildSuccessResponse,
  sendError,
  sendSuccess,
} from '../src/responses/response-builder.js';
import { HTTP_STATUS } from '../src/responses/response-codes.js';
import { VALID_CORRELATION_ID, VALID_REQUEST_ID } from './helpers/test-app.js';

function createRequest(overrides = {}) {
  return {
    requestId: VALID_REQUEST_ID,
    correlationId: VALID_CORRELATION_ID,
    app: {
      locals: {
        appConfig: {
          version: '1.2.3',
          isProduction: false,
        },
      },
    },
    ...overrides,
  };
}

describe('shared response envelope', () => {
  it('builds the success envelope with shared metadata', () => {
    const timestamp = '2026-01-01T00:00:00.000Z';
    const body = buildSuccessResponse({
      data: { id: 'resource-1' },
      request: createRequest(),
      timestamp,
    });

    expect(body).toEqual({
      success: true,
      data: { id: 'resource-1' },
      error: null,
      metadata: {
        requestId: VALID_REQUEST_ID,
        correlationId: VALID_CORRELATION_ID,
        timestamp,
        version: '1.2.3',
      },
    });
  });

  it('normalizes undefined success data to null', () => {
    expect(buildSuccessResponse({ request: createRequest() }).data).toBeNull();
  });

  it('falls back to the request ID when correlation metadata is missing', () => {
    const metadata = buildResponseMetadata(
      createRequest({ correlationId: undefined }),
      '2026-01-01T00:00:00.000Z',
    );

    expect(metadata.correlationId).toBe(VALID_REQUEST_ID);
  });

  it('builds the error envelope through the shared error normalizer', () => {
    const response = buildErrorResponse({
      error: AppError.notFound('Missing resource.'),
      request: createRequest(),
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      success: false,
      data: null,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Missing resource.',
        details: null,
      },
      metadata: {
        requestId: VALID_REQUEST_ID,
        correlationId: VALID_CORRELATION_ID,
        timestamp: '2026-01-01T00:00:00.000Z',
        version: '1.2.3',
      },
    });
  });

  it('sends success responses with the requested status', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const response = { status, req: createRequest() };

    sendSuccess(response, { created: true }, HTTP_STATUS.CREATED);

    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { created: true } }),
    );
  });

  it('sends error responses with the normalized status', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const response = { status, req: createRequest() };

    sendError(response, AppError.badRequest('Bad input.'));

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'BAD_REQUEST', message: 'Bad input.' }),
      }),
    );
  });
});
