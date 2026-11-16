import {
  ERROR_CODES,
  getDefaultErrorMessage,
  getHttpStatusForErrorCode,
} from './error-codes.js';

export class AppError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   * @param {{ statusCode?: number, details?: unknown, cause?: unknown, isOperational?: boolean }} [options]
   */
  constructor(code, message = getDefaultErrorMessage(code), options = {}) {
    const {
      statusCode = getHttpStatusForErrorCode(code),
      details = null,
      cause,
      isOperational = true,
    } = options;

    super(message, cause === undefined ? undefined : { cause });
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
  }

  static validation(details, message = getDefaultErrorMessage(ERROR_CODES.VALIDATION_ERROR)) {
    return new AppError(ERROR_CODES.VALIDATION_ERROR, message, { details });
  }

  static notFound(message = getDefaultErrorMessage(ERROR_CODES.RESOURCE_NOT_FOUND)) {
    return new AppError(ERROR_CODES.RESOURCE_NOT_FOUND, message);
  }

  static rateLimited(message = getDefaultErrorMessage(ERROR_CODES.RATE_LIMIT_EXCEEDED)) {
    return new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, message);
  }

  static badRequest(message = getDefaultErrorMessage(ERROR_CODES.BAD_REQUEST)) {
    return new AppError(ERROR_CODES.BAD_REQUEST, message);
  }

  static internal(message = getDefaultErrorMessage(ERROR_CODES.INTERNAL_SERVER_ERROR)) {
    return new AppError(ERROR_CODES.INTERNAL_SERVER_ERROR, message, { isOperational: false });
  }
}
