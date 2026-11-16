import { AppError } from '../errors/app-error.js';

const VALID_SOURCES = new Set(['body', 'query', 'params']);

function toValidationDetails(source, issues) {
  return issues.map((issue) => ({
    source,
    field: issue.path.length > 0 ? issue.path.map(String).join('.') : source,
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Validates selected request inputs with Zod and exposes parsed values on
 * request.validated so controllers never handle raw transport data.
 * @param {{ body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny }} schemas
 * @returns {import('express').RequestHandler}
 */
export function validateRequest(schemas) {
  if (typeof schemas !== 'object' || schemas === null) {
    throw new TypeError('validateRequest requires a schemas object');
  }

  const entries = Object.entries(schemas);

  for (const [source, schema] of entries) {
    if (!VALID_SOURCES.has(source)) {
      throw new TypeError(`Unsupported validation source: ${source}`);
    }

    if (schema !== undefined && typeof schema?.safeParse !== 'function') {
      throw new TypeError(`Schema for ${source} must be a Zod schema`);
    }
  }

  return function validationMiddleware(request, _response, next) {
    const validated = {};
    const details = [];

    for (const [source, schema] of entries) {
      if (schema === undefined) {
        continue;
      }

      const result = schema.safeParse(request[source]);

      if (result.success) {
        validated[source] = result.data;
      } else {
        details.push(...toValidationDetails(source, result.error.issues));
      }
    }

    if (details.length > 0) {
      next(AppError.validation(details));
      return;
    }

    request.validated = validated;
    next();
  };
}
