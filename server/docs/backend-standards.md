# SyncSphere Backend Standards

This document defines the backend foundation standards for the SyncSphere API. It applies to the current JavaScript-only Express service and to future REST and Socket.IO modules.

## Scope

The current backend provides the application foundation and authentication:

- Express 5 application factory
- Versioned API routing
- Health endpoint
- Shared response envelope
- Request and correlation identifiers
- Zod request validation middleware
- Helmet, CORS, rate limiting, and body limits
- Pino structured logging
- Centralized error handling
- Graceful shutdown
- Managed MySQL, MongoDB, and Redis connection lifecycle
- Liveness and dependency-readiness endpoints
- Argon2id password authentication with JWT access tokens and rotating refresh sessions
- Role-based authorization from database-backed roles and permissions
- CSRF protection, auth rate limiting, and authentication audit events
- Versioned MySQL migrations and CLI-only administrator provisioning
- Vitest and Supertest test coverage

Authentication and authorization are implemented. Business-domain modules, Socket.IO, WebRTC, uploads, queues, and unrelated caching remain intentionally out of scope until explicitly requested.

## Runtime and Structure

The backend uses native JavaScript ESM (`"type": "module"`). It does not require TypeScript, `tsconfig.json`, or a build step.

```text
server/
  scripts/                         Migration and administrator provisioning CLIs
  src/
    app.js                         Express app factory
    server.js                      Runtime entry point
    config/                        Environment loading, auth config, version lookup
    constants/                     Application, HTTP, database, and auth constants
    database/                      Managed clients and versioned MySQL migrations
    errors/                        AppError, stable codes, serialization
    middleware/                    IDs, logging, validation, auth, authorization, errors
    modules/
      admin/                       Protected authorization probe
      auth/                        Auth controllers, service, routes, repositories
      health/                      Health, liveness, and readiness routes
    responses/                     Shared envelope builders
    routes/                        Versioned routers
    security/                      Helmet, CORS, auth crypto, CSRF, rate limits
    utils/                         Logger, identifiers, graceful shutdown
  tests/                           Vitest + Supertest suites
  docs/                            Backend standards
```

`app.js` exports `createApp({ config, logger, databaseManager, authService })` and never binds a port. Tests inject mock managers, clients, or auth services. `server.js` loads configuration, creates the database manager, initializes dependencies, creates the app, starts HTTP, and installs process-level shutdown handling.

## Startup and Shutdown

Startup order:

1. Load and validate environment configuration.
2. Fail fast with a clear startup error if configuration is invalid.
3. Create the Pino logger.
4. Create the database manager and initialize dependencies according to `DATABASE_STARTUP_POLICY`.
5. Build the Express application with the manager attached at `app.locals.databaseManager`.
6. Bind the HTTP server.
7. Register `SIGTERM` and `SIGINT` handlers.

Under the `required` policy, any configured dependency that fails initialization aborts startup, cleans up dependencies in reverse order, and exits with code `1`. Under the `optional` policy, missing or unavailable dependencies are logged but do not prevent the HTTP server from starting.

Shutdown stops accepting new connections, closes the HTTP server, then closes Redis, MongoDB, and MySQL in that order before exiting with code `0`. If shutdown exceeds `SHUTDOWN_TIMEOUT_MS`, remaining connections are closed and the process exits with code `1`. Duplicate shutdown requests are ignored.

`uncaughtException`, `unhandledRejection`, and HTTP server errors are logged at `fatal` level and routed through the same graceful shutdown path.

## Configuration

Configuration is validated at startup with Zod. Invalid values fail fast.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `PORT` | No | `3000` | Integer `0`-`65535`; `0` selects an ephemeral port |
| `API_PREFIX` | No | `/api` | Normalized to one leading slash and no trailing slash |
| `CORS_ORIGIN` | Production: yes | `http://localhost:4200` in development | Comma-separated explicit origins |
| `TRUST_PROXY` | No | `false` | `false` or an integer hop count `1`-`10` |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` | `1000`-`86400000` |
| `RATE_LIMIT_MAX` | No | `100` | Requests per window per client |
| `BODY_LIMIT` | No | `1mb` | Express body size, e.g. `100kb`, `1mb`, `1gb` |
| `SHUTDOWN_TIMEOUT_MS` | No | `10000` | `1000`-`60000` |
| `LOG_LEVEL` | No | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |

Production requires at least one explicit `CORS_ORIGIN`. Wildcards are rejected. Origins may not contain paths, queries, or fragments. Proxy trust must be deliberate; do not enable a permissive proxy configuration.

The application version is read from `package.json` and exposed in health and response metadata.

## Authentication Configuration

Authentication configuration is validated at startup and fails fast on invalid or unsafe values.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `AUTH_ACCESS_TOKEN_SECRET` | Yes | - | At least 32 characters; never reuse the CSRF secret |
| `AUTH_CSRF_SECRET` | Yes | - | At least 32 characters; must differ from the access-token secret |
| `AUTH_ACCESS_TOKEN_ISSUER` | No | `syncsphere-api` | JWT `iss` claim |
| `AUTH_ACCESS_TOKEN_AUDIENCE` | No | `syncsphere-web` | JWT `aud` claim |
| `AUTH_ACCESS_TOKEN_TTL_SECONDS` | No | `900` | `60`-`3600` seconds |
| `AUTH_ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS` | No | `5` | `0`-`30` seconds |
| `AUTH_REFRESH_TOKEN_TTL_SECONDS` | No | `604800` | `300`-`2592000` seconds |
| `AUTH_REFRESH_COOKIE_NAME` | No | `syncsphere_refresh` | Letters, numbers, hyphens, underscores only |
| `AUTH_CSRF_COOKIE_NAME` | No | `syncsphere_csrf` | Letters, numbers, hyphens, underscores only |
| `AUTH_REFRESH_COOKIE_PATH` | No | `${API_PREFIX}/v1/auth` | Absolute URL path |
| `AUTH_REFRESH_COOKIE_DOMAIN` | No | - | Optional cookie domain |
| `AUTH_REFRESH_COOKIE_SAME_SITE` | No | `strict` | `strict`, `lax`, or `none` |
| `AUTH_REFRESH_COOKIE_SECURE` | Production: yes | `true` in production, `false` otherwise | Required for `SameSite=None` |
| `AUTH_PASSWORD_MIN_LENGTH` | No | `12` | `8`-`256`; must not exceed the maximum |
| `AUTH_PASSWORD_MAX_LENGTH` | No | `128` | `8`-`256` |
| `AUTH_ARGON2_MEMORY_KIB` | No | `19456` | `8192`-`262144` KiB |
| `AUTH_ARGON2_TIME_COST` | No | `2` | `2`-`10` |
| `AUTH_ARGON2_PARALLELISM` | No | `1` | `1`-`4` |
| `AUTH_RATE_LIMIT_WINDOW_MS` | No | `900000` | Shared auth limiter window |
| `AUTH_LOGIN_RATE_LIMIT_MAX` | No | `10` | Per client per window |
| `AUTH_REGISTER_RATE_LIMIT_MAX` | No | `5` | Per client per window |
| `AUTH_REFRESH_RATE_LIMIT_MAX` | No | `60` | Shared by refresh and logout |

Production requires secure refresh cookies. `SameSite=None` also requires secure cookies. Secrets must be supplied by the deployment environment; `.env.example` contains placeholders only.

## Database Configuration

Database configuration is validated with the rest of the environment at startup. Secrets are never logged or returned in responses.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_STARTUP_POLICY` | Production: yes | `required` in production, `optional` otherwise | `required` or `optional`; production rejects `optional` |
| `DATABASE_CONNECT_TIMEOUT` | No | `10000` | Shared default in milliseconds; `1000`-`60000` |
| `MYSQL_HOST` | Required group | - | Enables MySQL when any MySQL variable is set |
| `MYSQL_PORT` | No | `3306` | `1`-`65535` |
| `MYSQL_USER` | Required group | - | MySQL user |
| `MYSQL_PASSWORD` | Required policy: yes | empty | Never logged |
| `MYSQL_DATABASE` | Required group | - | MySQL database name |
| `MYSQL_CONNECTION_LIMIT` | No | `10` | `1`-`1000` |
| `MYSQL_CONNECT_TIMEOUT` | No | `DATABASE_CONNECT_TIMEOUT` | `1000`-`60000` |
| `MYSQL_SSL` | No | `false` | `true` enables TLS with certificate validation |
| `MONGODB_URI` | Required group | - | Must use `mongodb://` or `mongodb+srv://` |
| `MONGODB_DATABASE` | Required group | - | MongoDB database name |
| `MONGODB_MAX_POOL_SIZE` | No | `10` | `1`-`1000` |
| `MONGODB_SERVER_SELECTION_TIMEOUT` | No | `DATABASE_CONNECT_TIMEOUT` | `1000`-`60000` |
| `REDIS_URL` | Required group | - | Must use `redis://` or `rediss://` |
| `REDIS_CONNECT_TIMEOUT` | No | `DATABASE_CONNECT_TIMEOUT` | `1000`-`60000` |
| `REDIS_MAX_RETRIES` | No | `5` | `0`-`50` |

Rules:

- A partially supplied dependency group is rejected, even in optional mode. Supply all required values for a dependency or none.
- `required` mode requires all three dependencies to be configured and connected before HTTP starts.
- `optional` mode allows missing or unavailable dependencies. Readiness still reports their real status; never report an unavailable dependency as connected.
- Supported statuses are `not_configured`, `not_initialized`, `initializing`, `connected`, `disconnected`, `unavailable`, and `closed`.
- MySQL queries must be parameterized through the managed client. Do not concatenate user input into SQL.

## Database Lifecycle

`server.js` creates exactly one database manager per process. The manager owns the MySQL pool, MongoDB client, and Redis client for the process lifetime. `app.locals.databaseManager` exposes it to request handlers.

Future modules must reuse the managed clients:

```js
const mysql = request.app.locals.databaseManager.getClient('mysql');
const mongodb = request.app.locals.databaseManager.getClient('mongodb');
const redis = request.app.locals.databaseManager.getClient('redis');
```

Rules:

- Do not create additional pools or driver clients in controllers or modules.
- Do not call `initialize()` or `shutdown()` from request handlers.
- MySQL access goes through `mysql.query(sql, parameters)`; never interpolate untrusted values into SQL.
- MongoDB access goes through `mongodb.getDatabase()`.
- Redis access goes through `redis.getClient()`.
- Connection failures are wrapped in stable `DATABASE_*` errors. Do not expose raw driver errors.
- Authentication repositories reuse the managed MySQL client. Do not create additional pools in request handlers.
- MySQL remains the durable source of truth for users and refresh sessions. Redis is used only as a revocation cache and must never be the sole source of truth.
- Business-domain schemas, queues, Socket.IO, and unrelated caching remain out of scope until explicitly requested.

## Authentication and Authorization

### Password Handling

- Passwords are hashed with Argon2id and random salts using the configured memory, time, and parallelism costs.
- Password hashes and plaintext passwords must never appear in responses, logs, audit events, or error details.
- Unknown-email logins perform a dummy Argon2 verification so failure timing is comparable to a wrong-password login.
- Login failures return the same generic `INVALID_CREDENTIALS` response for unknown emails and wrong passwords.
- Disabled accounts are rejected after password verification with `ACCOUNT_DISABLED`.

### Access Tokens

- Access tokens are short-lived HS256 JWTs signed with `jose`.
- Protected headers require `typ: at+jwt`; payload requires `token_type: access`.
- Required claims are `sub`, `jti`, `sid`, `iss`, `aud`, `iat`, and `exp`.
- Verification enforces the configured issuer, audience, algorithm allowlist, clock tolerance, and claim types.
- Access tokens are sent as `Authorization: Bearer <token>`.
- Roles and permissions are never trusted from JWT claims. They are loaded from MySQL on every authenticated request.

### Refresh Sessions

- Refresh tokens are opaque random values; only their SHA-256 hashes are stored in MySQL.
- The refresh token is stored in an `HttpOnly` cookie. The response body never contains it.
- Refresh rotation revokes the old row and creates a new row in the same token family.
- Reuse of a rotated token revokes the entire family and returns `TOKEN_REUSE_DETECTED`.
- Expired, disabled-account, and missing-user refreshes revoke the family.
- Logout revokes the whole session family and clears both auth cookies.
- Session listing and revocation are scoped to the authenticated user; cross-user access returns `RESOURCE_NOT_FOUND`.
- MySQL is the durable session source of truth. Redis stores short-lived revocation markers so revoked sessions can be rejected quickly, but MySQL remains authoritative.
- Every authenticated request checks the Redis revocation marker and then verifies that an unrevoked, unexpired session family still exists in MySQL. If Redis is unavailable, the request falls back to the MySQL check; a revoked session is never accepted because of a cache failure.
- Revocation markers expire after the access-token lifetime plus clock tolerance and a 60-second safety margin. Marker expiry removes only the fast-path cache entry; the MySQL session row remains the authoritative revoked state.

### Authentication Rate Limiting

- Authentication rate limiting uses `express-rate-limit` with the maintained `rate-limit-redis` store.
- Each authentication operation creates its own store instance and Redis key namespace, but all instances share the existing managed Redis connection. No additional Redis client is created.
- Login, registration, and refresh/logout counters are stored in Redis, so limits are consistent across PM2 workers and other multi-instance deployments.
- The existing `AUTH_*_RATE_LIMIT_MAX` and `AUTH_RATE_LIMIT_WINDOW_MS` values continue to define the limits.
- Redis store failures fail closed: the request returns `503 SERVICE_UNAVAILABLE` and the authentication service is not called. There is no automatic fallback to per-process counters when Redis is configured but unavailable.
- In production, startup fails if Redis is not configured for authentication rate limiting.
- In development and test, a missing Redis configuration uses the built-in in-memory store and logs an explicit warning. That fallback is process-local and is not suitable for multiple instances.

### CSRF and Browser Boundaries

- Refresh and logout require both the signed CSRF cookie and matching `X-CSRF-Token` header.
- The CSRF token is an HMAC over a random nonce and the session family ID, so it is session-bound and cannot be forged through a sibling domain.
- State-changing auth routes validate `Origin`/`Referer` against the CORS allowlist and reject `Sec-Fetch-Site: cross-site`.
- Missing origin metadata is allowed for non-browser clients, but cookie-authenticated operations still require CSRF validation.
- Login and registration are rate limited separately from refresh/logout.
- Client-supplied roles and permissions are stripped by Zod validation and ignored.

### Roles and Permissions

Seeded roles are `SUPER_ADMIN`, `ADMIN`, `MANAGER`, and `USER`. Seeded permissions are `users:read`, `users:create`, `users:update`, `users:delete`, `dashboard:read`, and `admin:access`.

Authorization middleware requires all listed permissions and any listed role. It reads only `request.auth`, which is populated from trusted MySQL-backed authorization data.

### Auth Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Public, rate limited | Create a `USER` account |
| `POST` | `/api/v1/auth/login` | Public, rate limited | Issue access token and refresh session |
| `POST` | `/api/v1/auth/refresh` | Refresh cookie + CSRF | Rotate refresh token and issue access token |
| `POST` | `/api/v1/auth/logout` | Refresh cookie + CSRF | Revoke session family and clear cookies |
| `GET` | `/api/v1/auth/me` | Bearer | Return current user, roles, and permissions |
| `GET` | `/api/v1/auth/sessions` | Bearer | List active session families |
| `DELETE` | `/api/v1/auth/sessions/:sessionId` | Bearer | Revoke one owned session |
| `GET` | `/api/v1/admin/access` | Bearer + `admin:access` | Protected authorization probe |

Registration always assigns the `USER` role. There is no public endpoint for granting privileged roles. Initial `SUPER_ADMIN` provisioning is CLI-only.

### Migrations and Provisioning

Versioned SQL migrations live under `src/database/migrations/` and are applied by `npm run migrate`. The runner uses a MySQL advisory lock, tracks applied migrations in `schema_migrations`, and supports `npm run migrate -- down`.

Initial administrator provisioning is performed only with:

```bash
ADMIN_PROVISION_CONFIRM=YES npm run provision:admin
```

It requires `ADMIN_EMAIL`, `ADMIN_FULL_NAME`, and a policy-compliant `ADMIN_PASSWORD`, assigns `SUPER_ADMIN`, and revokes existing sessions for that account. No public super-admin endpoint exists.

### Authentication Audit Events

Structured audit events cover registration, successful and failed login, token refresh, token reuse, logout, and session revocation. Audit payloads contain event, outcome, user ID, request ID, correlation ID, and a safe reason; they never contain passwords, tokens, cookies, or email addresses.

## Middleware Order

The order is intentional and must not be rearranged without review:

1. Request and correlation ID middleware
2. Helmet security headers
3. CORS allowlist
4. Request completion logging
5. JSON and URL-encoded body parsing with limits
6. Rate limiting
7. Versioned API routes
8. Not-found middleware
9. Centralized error handler

IDs are established first so every response and log, including failures in later middleware, can reference them.

Auth routes add route-scoped middleware in this order: origin validation, operation-specific rate limiting, request validation, CSRF validation where required, then the controller. Protected routes run bearer authentication before authorization.

## Response Envelope

All REST responses except the legacy `GET /api/v1/health` endpoint use this envelope.

Success:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "metadata": {
    "requestId": "uuid",
    "correlationId": "uuid",
    "timestamp": "ISO-8601",
    "version": "1.0.0"
  }
}
```

Error:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields.",
    "details": []
  },
  "metadata": {
    "requestId": "uuid",
    "correlationId": "uuid",
    "timestamp": "ISO-8601",
    "version": "1.0.0"
  }
}
```

Rules:

- Use `src/responses/response-builder.js` for success and error envelopes.
- `data` is `null` when no data is returned.
- `error` is `null` for success.
- Metadata always includes request ID, correlation ID, timestamp, and application version.
- HTTP status remains a transport concern. Socket.IO events must reuse the same logical envelope without inventing an HTTP status.
- Never return a different ad hoc error shape from a controller, middleware, or module.

## Health Endpoint Exception

`GET /api/v1/health` preserves the legacy health contract exactly and does not use the shared envelope:

```json
{
  "success": true,
  "application": "SyncSphere API",
  "status": "healthy",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "version": "1.0.0"
}
```

It still returns `X-Request-Id` and `X-Correlation-Id` headers. Do not add `data`, `error`, or `metadata` to this body.

Liveness:

```http
GET /api/v1/health/live
```

Returns `200` with the shared success envelope and `data: { "status": "alive", "uptimeSeconds": 123 }`. It does not check database dependencies.

Readiness:

```http
GET /api/v1/health/ready
```

Returns `200` with the shared success envelope when every required dependency is connected. The data contains:

```json
{
  "status": "ready",
  "dependencies": {
    "mysql": "connected",
    "mongodb": "connected",
    "redis": "connected"
  },
  "requiredDependencies": ["mysql", "mongodb", "redis"],
  "optionalDependencies": []
}
```

If any required dependency is unavailable, readiness returns `503` with error code `DATABASE_UNAVAILABLE`. Optional dependencies are reported but never make readiness fail. Readiness never exposes connection strings, credentials, or raw driver errors.

## Request and Correlation IDs

- Accept `X-Request-Id` and `X-Correlation-Id` request headers.
- Accept only valid UUIDs. Invalid or missing request IDs are replaced with a generated UUID.
- A missing or invalid correlation ID falls back to the resolved request ID.
- Return both IDs in `X-Request-Id` and `X-Correlation-Id` response headers.
- Include both IDs in response metadata and structured logs.
- Expose parsed values as `request.requestId`, `request.correlationId`, `request.id`, and `response.locals`.

## Validation

Use `validateRequest({ body, query, params })` with Zod schemas. Parsed values are available on `request.validated[source]`; controllers must not parse raw transport input.

Invalid requests return `400` with `VALIDATION_ERROR`. Details identify the source, field path, message, and Zod issue code.

Unknown fields are stripped by Zod object schemas by default. Use explicit strict or passthrough schemas only when the API contract requires it.

## Error Handling

Throw `AppError` for expected failures. Unknown errors are converted by the centralized handler.

Stable error codes:

| Code | HTTP status |
| --- | --- |
| `VALIDATION_ERROR` | 400 |
| `BAD_REQUEST` | 400 |
| `UNAUTHORIZED` | 401 |
| `AUTHENTICATION_REQUIRED` | 401 |
| `INVALID_CREDENTIALS` | 401 |
| `ACCOUNT_DISABLED` | 403 |
| `EMAIL_ALREADY_EXISTS` | 409 |
| `TOKEN_EXPIRED` | 401 |
| `TOKEN_INVALID` | 401 |
| `TOKEN_REUSE_DETECTED` | 401 |
| `SESSION_REVOKED` | 401 |
| `CSRF_VALIDATION_FAILED` | 403 |
| `INSUFFICIENT_PERMISSIONS` | 403 |
| `FORBIDDEN` | 403 |
| `RESOURCE_NOT_FOUND` | 404 |
| `RESOURCE_CONFLICT` | 409 |
| `PAYLOAD_TOO_LARGE` | 413 |
| `RATE_LIMIT_EXCEEDED` | 429 |
| `DATABASE_OPERATION_FAILED` | 500 |
| `DATABASE_CONNECTION_FAILED` | 503 |
| `DATABASE_UNAVAILABLE` | 503 |
| `DATABASE_INITIALIZATION_FAILED` | 503 |
| `INTERNAL_SERVER_ERROR` | 500 |
| `SERVICE_UNAVAILABLE` | 503 |

Production sanitization:

- Internal error messages and stacks are never returned in production.
- Safe validation details remain available in production.
- Internal error details and stacks may be exposed only outside production.
- Malformed JSON maps to `BAD_REQUEST`; oversized payloads map to `PAYLOAD_TOO_LARGE`.

Controllers must not send error responses directly. Pass errors to the centralized handler.

## Security Standards

- Helmet is applied to every request.
- `X-Powered-By` is disabled.
- CORS uses an explicit allowlist. Production wildcards are rejected. Requests without an `Origin` header remain allowed for health probes and server-to-server calls.
- Rate limiting applies to the versioned API and reports through the shared error envelope.
- Authentication rate limits use the managed Redis client through `rate-limit-redis`; store failures fail closed with `SERVICE_UNAVAILABLE`.
- JSON and URL-encoded bodies are limited by `BODY_LIMIT`.
- Trusted proxy configuration is explicit and validated.
- Do not log request bodies, authorization headers, cookies, passwords, tokens, or secrets.
- Log request paths without query strings.
- Do not log database URLs, passwords, or raw driver errors. Use the database error sanitizer.
- Readiness responses expose dependency statuses only, never connection details.
- Store refresh tokens only as SHA-256 hashes in MySQL and deliver the raw token only through an `HttpOnly` cookie.
- Keep access tokens short-lived and verify issuer, audience, algorithm, token type, and required claims.
- Do not trust client-supplied roles or permissions, and do not read authorization from JWT claims.
- Require CSRF validation for cookie-authenticated state-changing auth routes.
- Require secure cookies in production; reject insecure production configuration at startup.
- Keep auth secrets independent and at least 32 characters; never commit real values.

## Logging

Pino emits structured JSON logs. Request completion logs include:

- request and correlation IDs
- HTTP method
- path without query string
- status code
- duration in milliseconds
- client IP
- user agent
- aborted flag

Sensitive fields are redacted by logger configuration. Client errors are logged at `warn`; server errors at `error`; startup and process failures at `fatal`.

## Testing

Run from `server/`:

```bash
npm run lint
npm test
```

Tests use Vitest and Supertest and cover:

- configuration validation and production CORS requirements
- database startup policy and dependency configuration validation
- managed MySQL, MongoDB, and Redis initialization, health, errors, and closure
- database manager ordering, partial failure cleanup, readiness, and idempotency
- health contract, liveness, readiness, and ID headers
- success and error envelopes
- stable error codes and production sanitization
- request/correlation ID acceptance and fallback
- 404 and malformed JSON behavior
- payload limits
- Zod validation details
- CORS allowlist and preflight behavior
- Helmet headers
- rate limiting
- shared Redis-backed authentication rate limiting across application instances
- authentication rate-limit store failure, production Redis requirements, and documented development fallback
- sensitive-data logging exclusions
- graceful shutdown success, failure, timeout, resource cleanup, and duplicate requests
- auth configuration validation and unsafe production settings
- Argon2id hashing, verification, and password policy
- JWT signing, verification, expiry, algorithm, issuer, audience, and token-type rejection
- signed session-bound CSRF tokens and double-submit middleware
- registration, login, refresh rotation, reuse detection, logout, session listing, and cross-user revocation
- access-token rejection after logout, explicit session revocation, and refresh-token reuse detection
- Redis revocation-marker checks, Redis-unavailable fallback to MySQL, and marker expiration
- auth route validation, cookie flags, origin checks, CSRF failures, rate limiting, and response envelopes
- bearer authentication, permission enforcement, and the protected admin probe
- auth audit/log redaction and Redis revocation-cache degradation
- MySQL transaction commit, rollback, release, and safe error wrapping
- migration statement splitting, ordering, idempotency, rollback, and lock release
- native ESM imports

## Future REST and Socket.IO Modules

Future modules must:

- live under `src/modules/<domain>/` with controller and router files
- mount under the versioned router
- use `AppError` and stable error codes
- use the shared response builders
- validate input with `validateRequest`
- keep transport concerns out of business logic
- reuse request metadata for Socket.IO events
- preserve the health endpoint's legacy body shape
- reuse `createAuthenticateMiddleware` and `authorize` instead of implementing ad hoc auth checks
- reuse the managed MySQL client for durable data and the managed Redis client for non-authoritative caching only
- add versioned migrations instead of changing existing migrations after release

Do not add business-domain schemas, queues, Socket.IO, WebRTC, uploads, or unrelated caching until a later task explicitly requires them.

