# Task 14 - Infrastructure and Database Verification Report

Date: 2026-11-17

## Verdict

| Area | Status | Evidence |
| --- | --- | --- |
| Docker Compose runtime | NOT VERIFIED | Docker engine and Compose are not installed on this host. |
| MySQL integration | VERIFIED | Real MySQL 8.0.35 on `127.0.0.1:3307`; migrations, CRUD, transactions, constraints, and pool behavior passed. |
| MongoDB integration | VERIFIED | Real MongoDB 7.0.12 on `127.0.0.1:37017`; connectivity, CRUD, indexes, duplicate handling, and reconnect behavior passed. |
| Redis integration | VERIFIED | Real Redis 7.4.11 on `127.0.0.1:16379`; commands, TTL, auth cache, rate limiting, reconnect, and fail-closed behavior passed. |
| Backend lifecycle | VERIFIED | Real startup, health/readiness, dependency failure, recovery, and graceful shutdown passed. |
| Auth flow | VERIFIED | Real registration, login, session, refresh rotation, reuse detection, revocation, and logout passed. |
| Integration test suite | PASS | 6 files, 32 tests passed twice. |
| Unit test suite | PASS | 24 files, 183 tests passed. |
| Lint | PASS | `npm run lint` completed without errors. |

## Environment

- Host: Windows.
- Node.js: `v26.7.0`.
- npm: `11.19.0`.
- Docker: not found. `docker compose` and `docker info` cannot run.
- MySQL used for verification: 8.0.35, temporary instance on `127.0.0.1:3307`.
- MongoDB used for verification: 7.0.12, temporary instance on `127.0.0.1:37017`.
- Redis used for verification: 7.4.11, portable Windows build on `127.0.0.1:16379`.

The installed Windows MySQL service on `3306` was not used because its root
credentials were unavailable. The installed MongoDB service on `27017` was not
used for the final run because the verification used an isolated temporary
instance. Redis 5.0.14.1 on `6379` was unusable with the current Node Redis
client because it does not support the `HELLO 3` handshake; Redis 7.4.11 was
required.

## Integration Test Execution

Working directory: `server`

Environment used:

```powershell
$env:MYSQL_HOST = '127.0.0.1'
$env:MYSQL_PORT = '3307'
$env:MYSQL_USER = 'syncsphere'
$env:MYSQL_PASSWORD = 'change-me'
$env:MYSQL_DATABASE = 'syncsphere'
$env:MONGODB_URI = 'mongodb://127.0.0.1:37017'
$env:MONGODB_DATABASE = 'syncsphere'
$env:REDIS_URL = 'redis://127.0.0.1:16379'

# Host-specific Windows workaround only; omit on Docker or Linux.
$env:NODE_OPTIONS = '--require C:\Users\yuvar\AppData\Local\Temp\opencode\local-port-patch.cjs'
```

Command:

```powershell
npm run test:integration
```

Result:

```text
Test Files  6 passed (6)
Tests       32 passed (32)
```

The suite passed on two consecutive runs, with durations of 12.85 seconds and
11.72 seconds.

## Coverage Verified

### MySQL

- Real connection and readiness check.
- Migration execution and schema availability.
- Pool acquisition and release.
- Parameterized create, read, update, and delete operations.
- Transaction commit and rollback.
- Duplicate and foreign-key constraint handling.

### MongoDB

- Real connection and ping.
- Document create, read, update, and delete.
- Unique index creation and duplicate-key handling.
- Client reconnect behavior.
- Closed-client access failure.

### Redis

- `PING`, `SET`, `GET`, `DEL`, and TTL behavior.
- Auth revocation cache behavior.
- Rate-limit store behavior.
- Reconnect through a real TCP proxy after a network interruption.
- Fail-closed rate limiting when Redis is unavailable.
- Fail-closed revocation checks when Redis is unavailable.

### Backend Lifecycle

- Backend startup against real databases.
- `/health`, `/live`, and `/ready` behavior.
- Dependency failure and recovery.
- Graceful shutdown.

### Authentication

- Registration and login.
- Current-user and session listing.
- Session revocation.
- Refresh-token rotation.
- Refresh-token reuse detection.
- Logout and revoked-token rejection.

## Fixes Applied

1. `server/tests/integration/support/unique-values.js`

   Shortened generated names so they fit `roles.name VARCHAR(50)`. The previous
   suffix caused `Data too long for column 'name'`.

2. `server/tests/integration/redis.integration.test.js`

   Added the missing `await store.init({ windowMs: 60_000 });` before rate-limit
   increments. Without initialization, the store returned `NaN`.

3. `server/tests/integration/redis.integration.test.js`

   Replaced the reset assertion with a Redis key existence check. The Redis
   rate-limit store returns `NaN` for a missing key, so `totalHits` was not a
   reliable reset signal.

4. `server/src/database/redis/redis.connection.js`

   Hardened Redis shutdown. `closeRedisClient` now destroys clients that are
   already closed or reconnecting and applies a 2-second timeout to `quit()`.
   This prevents backend or test shutdown from hanging when Redis is unavailable
   or a proxy connection has been torn down.

## Compose Assets Created

- `infrastructure/docker-compose.yml`
- `infrastructure/.env.example`
- `infrastructure/mongodb/init/01-create-app-user.js`

These files define MySQL, MongoDB, and Redis services with localhost-only ports,
named volumes, health checks, and a MongoDB application-user bootstrap.

Docker Compose runtime verification remains blocked because Docker is not
installed. The Compose stack has not been started, and its health checks and
volume behavior have not been exercised.

## Host Limitation

The Windows verification host intermittently failed loopback connections with
`EADDRINUSE`. The cause was operating-system reuse of local ephemeral ports that
were still in `TIME_WAIT`, not an application or database bug. The issue was
observed across MySQL, MongoDB, Redis, and HTTP loopback connections.

To complete verification, the test process used a temporary, non-committed Node
preload:

```text
C:\Users\yuvar\AppData\Local\Temp\opencode\local-port-patch.cjs
```

The preload assigned unique local ports for loopback connections. It is a
host-specific workaround, is not part of the repository, and is not required on
normal Docker or Linux environments. The integration tests themselves do not
depend on it.

## Residual Risks and Follow-Up

- Run `docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml up -d`
  on a host with Docker and confirm all three health checks become healthy.
- Validate the Compose stack with real credentials, including the MongoDB
  application user and Redis password.
- Run `npm run test:integration` against the Compose stack without any preload.
- Confirm the MongoDB application user can authenticate with
  `authSource=syncsphere` and perform `readWrite` operations.
- Consider adding a documented local verification script for the shell
  environment variables to reduce manual setup mistakes.

## Files Added or Changed for This Task

Added:

- `infrastructure/docker-compose.yml`
- `infrastructure/.env.example`
- `infrastructure/mongodb/init/01-create-app-user.js`
- `server/vitest.integration.config.js`
- `server/tests/integration/support/integration-environment.js`
- `server/tests/integration/support/integration-database.js`
- `server/tests/integration/support/unique-values.js`
- `server/tests/integration/support/integration-cookies.js`
- `server/tests/integration/support/redis-proxy.js`
- `server/tests/integration/support/wait-for.js`
- `server/tests/integration/database-connections.integration.test.js`
- `server/tests/integration/mysql.integration.test.js`
- `server/tests/integration/mongodb.integration.test.js`
- `server/tests/integration/redis.integration.test.js`
- `server/tests/integration/backend-lifecycle.integration.test.js`
- `server/tests/integration/auth-flow.integration.test.js`
- `docs/infrastructure/database-services.md`

Changed:

- `server/package.json`
- `server/vitest.config.js`
- `server/src/database/redis/redis.connection.js`
- `server/tests/database-clients.test.js`

## Conclusion

MySQL, MongoDB, Redis, backend lifecycle, and authentication were verified
against real local services. The integration suite and unit suite pass. Docker
Compose assets are present but remain unverified because Docker is unavailable
on this host. The only remaining infrastructure step is to run the same suite
against the Compose stack on a Docker-capable machine.
