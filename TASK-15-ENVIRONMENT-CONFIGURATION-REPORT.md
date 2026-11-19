# Task 15 - Environment Configuration Alignment Report

Date: 2026-11-17

## 1. Configuration Audit Results

The backend uses a Zod-validated environment loaded by
`node --env-file-if-exists=.env` in the npm scripts. Shell environment values
take precedence over `.env`. Integration tests use Vitest directly and do not
load `.env`.

Supported configuration is grouped into:

- Server: `NODE_ENV`, `PORT`, `API_PREFIX`, `CORS_ORIGIN`, `TRUST_PROXY`,
  `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `BODY_LIMIT`,
  `SHUTDOWN_TIMEOUT_MS`, `LOG_LEVEL`.
- Authentication: access-token and CSRF secrets, issuer, audience, token TTLs,
  refresh/CSRF cookie settings, password policy, Argon2id cost, and auth rate
  limits.
- Administrator provisioning: `ADMIN_PROVISION_CONFIRM`, `ADMIN_EMAIL`,
  `ADMIN_FULL_NAME`, `ADMIN_PASSWORD`.
- Database policy: `DATABASE_STARTUP_POLICY`, `DATABASE_CONNECT_TIMEOUT`.
- MySQL: host, port, user, password, database, pool limit, connect timeout, SSL.
- MongoDB: URI, database, pool size, server-selection timeout.
- Redis: URL, connect timeout, max retries.

No deprecated or unsupported application variables were found. The complete
reference is in `docs/configuration/environment.md`.

## 2. Files Inspected

Environment and Git:

- `server/.env` (inspected without reproducing secret values)
- `server/.env.example`
- `server/.gitignore`
- `.gitignore`
- `server/package.json`

Configuration and application:

- `server/src/config/app-config.js`
- `server/src/config/auth-config.js`
- `server/src/config/database-config.js`
- `server/src/config/index.js`
- `server/src/config/configuration-error.js`
- `server/src/constants/app.constants.js`
- `server/src/constants/auth.constants.js`
- `server/src/constants/database.constants.js`
- `server/src/server.js`
- `server/src/app.js`
- `server/src/utils/logger.js`
- `server/src/database/database-manager.js`
- `server/src/database/database-health.js`
- `server/src/database/database-errors.js`
- `server/src/database/mysql/mysql.connection.js`
- `server/src/database/mongodb/mongodb.connection.js`
- `server/src/database/redis/redis.connection.js`
- `server/src/middleware/error-handler.middleware.js`
- `server/src/errors/error-response.js`
- `server/scripts/migrate.js`
- `server/scripts/provision-admin.js`

Infrastructure and documentation:

- `infrastructure/docker-compose.yml`
- `infrastructure/.env.example`
- `infrastructure/mongodb/init/01-create-app-user.js`
- `docs/infrastructure/database-services.md`
- `README.md`

Tests:

- `server/tests/database-clients.test.js`
- Existing unit and integration suites

## 3. Files Modified

- `server/.env` - appended missing non-secret defaults and commented database
  and administrator placeholders. Existing values and secrets were preserved.
- `server/.env.example` - documented all supported variables, validation rules,
  production requirements, and Compose-aligned database placeholders.
- `infrastructure/.env.example` - clarified that it configures Compose only and
  gave MySQL and MongoDB application passwords distinct placeholders.
- `docs/configuration/environment.md` - new full environment reference, local
  setup, production checklist, verification, and troubleshooting.
- `docs/infrastructure/database-services.md` - added application environment
  guidance, connectivity verification, and production differences.
- `README.md` - added the environment documentation link.

`server/.env` is ignored by Git and was not staged or committed.

## 4. Missing Environment Variables

No required application or authentication variable is missing from
`server/.env`. The two required secrets are present, at least 32 characters, and
distinct. Values were not printed.

The following database variables remain intentionally inactive in
`server/.env` because real credentials are unavailable:

- MySQL: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`,
  `MYSQL_DATABASE`, `MYSQL_CONNECTION_LIMIT`, `MYSQL_CONNECT_TIMEOUT`,
  `MYSQL_SSL`.
- MongoDB: `MONGODB_URI`, `MONGODB_DATABASE`, `MONGODB_MAX_POOL_SIZE`,
  `MONGODB_SERVER_SELECTION_TIMEOUT`.
- Redis: `REDIS_URL`, `REDIS_CONNECT_TIMEOUT`, `REDIS_MAX_RETRIES`.

These are documented as commented placeholders with the host, port, user, and
database values matching `infrastructure/docker-compose.yml`. No database
password was invented.

`ADMIN_*` variables are also commented because they are only needed for the
one-time `npm run provision:admin` command.

## 5. Security Findings

- `server/.env` is ignored by Git and is not tracked.
- `.env.example` files contain safe placeholders only and no real credentials.
- Required authentication secrets are present in the local `.env`, are at least
  32 characters, and are different values.
- Production validation rejects missing or identical secrets, short secrets,
  missing or wildcard CORS origins, insecure refresh cookies, and
  `DATABASE_STARTUP_POLICY=optional`.
- Production validation rejects `AUTH_REFRESH_COOKIE_SAME_SITE=none` unless
  Secure cookies are enabled.
- Database errors are sanitized, logger redaction covers common secret fields,
  and production error responses use generic messages.
- Local `.env` uses `AUTH_REFRESH_COOKIE_SECURE=false`, which is appropriate for
  local HTTP but must be changed to `true` in production.
- `TRUST_PROXY=false` is appropriate locally and must only be changed when the
  API is behind a trusted proxy.
- No real database credentials exist in `infrastructure/.env`; the file is not
  present. This avoids committing or inventing credentials.

## 6. `.env` and `.env.example` Alignment Status

- `server/.env.example` documents all supported keys: server, CORS/proxy, body
  limits, rate limiting, shutdown, logging, JWT access tokens, CSRF, refresh
  cookies, Argon2id policy, auth rate limits, administrator provisioning,
  database policy, MySQL, MongoDB, and Redis.
- Defaults in the example match the constants and Zod schemas in the backend.
- Database placeholders match Compose host ports, usernames, and database names.
- `server/.env` is aligned for server and authentication settings and uses the
  same defaults as the example.
- `server/.env` intentionally leaves database and administrator settings
  commented until real local or deployment credentials are supplied.
- `infrastructure/.env.example` matches every variable consumed by
  `infrastructure/docker-compose.yml`.
- No unsupported variable is documented as implemented.

## 7. MySQL, MongoDB, and Redis Configuration Status

Configuration is verified for all three databases. Actual connectivity was also
tested against real local services using shell environment variables, not the
database block in `server/.env`.

| Database | Configuration status | Connectivity status |
| --- | --- | --- |
| MySQL | Aligned with code and Compose. | Verified against local MySQL 8.0.35 on `127.0.0.1:3307` through the integration suite. |
| MongoDB | Aligned with code and Compose. | Verified against local MongoDB 7.0.12 on `127.0.0.1:37017` through the integration suite. |
| Redis | Aligned with code and Compose. | Verified against local Redis 7.4.11 on `127.0.0.1:16379` through the integration suite. |

The real Compose stack was not started because Docker is unavailable on this
host. The actual `server/.env` database block remains commented, so the `.env`
file itself has not been used for real database connectivity.

## 8. Lint and Test Results

- `npm run lint`: passed.
- `npm test`: 24 files, 183 tests passed.
- `npm run test:integration`: 6 files, 32 tests passed against the real local
  services.
- Configuration parse with `server/.env`: passed. The database policy is
  `optional` and no database dependency is active.
- Configuration parse with `server/.env.example`: passed.
- Production guard checks produced the expected errors for:
  - insecure refresh cookie in production,
  - optional database policy in production,
  - required policy with missing database dependencies.

The integration run used the host-specific Windows loopback workaround
documented in the Task 14 report. It is not part of the repository.

## 9. Remaining Manual Actions

1. Create `infrastructure/.env` from `infrastructure/.env.example` and set real
   local passwords.
2. Start the Compose stack on a Docker-capable host.
3. Copy the matching MySQL, MongoDB, and Redis values into `server/.env`,
   uncomment the database block, and replace the placeholders.
4. Run `npm run migrate` and `npm run dev`, then verify
   `/api/v1/health/live`, `/api/v1/health/ready`, and `/api/v1/health`.
5. Run `npm run test:integration` against the Compose stack without the Windows
   preload.
6. Before production, set `NODE_ENV=production`,
   `DATABASE_STARTUP_POLICY=required`, `AUTH_REFRESH_COOKIE_SECURE=true`,
   explicit HTTPS CORS origins, independent secrets from a secret manager, and
   TLS-enabled database connections.
7. Docker Compose runtime remains unverified until it is run on a host with
   Docker.

## Configuration Verification vs Connectivity Verification

Configuration verification means the environment variables parse, match the
application schemas, and satisfy production guards. Connectivity verification
means a running MySQL, MongoDB, or Redis service accepted real operations.

This task verified configuration for the application and infrastructure files.
It verified connectivity against real local services through the integration
suite. It did not verify connectivity through the Compose stack or through the
commented database block in `server/.env`.
