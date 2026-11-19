# Task 16 – Real Database Activation Report

## 1. Service Status
- Initial check: MySQL `127.0.0.1:3307`, MongoDB `127.0.0.1:37017`, and Redis `127.0.0.1:16379` were all reachable.
- During credential provisioning, the three temporary Task 14 processes had stopped and their ports were no longer listening.
- The known Task 14 instances were restarted from their original data directories and configurations. No existing data, database, user account, or volume was deleted, dropped, reset, or replaced.
- Final check: all three services were reachable and used for the verification below.

## 2. Actual Service Versions
| Service | Endpoint | Version | Verification |
| --- | --- | --- | --- |
| MySQL | `127.0.0.1:3307` | `8.0.35` | `mysqld --version`, migration/startup logs, `SELECT VERSION()` |
| MongoDB | `127.0.0.1:37017` | `7.0.12` | `mongod --version`, `buildInfo` command |
| Redis | `127.0.0.1:16379` | `7.4.11` | `redis-server --version`, `PING`, `CONFIG GET requirepass` |

## 3. Credential Verification Status
- **MySQL**: a new dedicated local application user was created because the existing `syncsphere` user's password was the prohibited placeholder value, and the root account has an empty password. The new user uses `caching_sha2_password` and has `ALL PRIVILEGES` on `syncsphere.*` only. The generated password is stored only in the ignored `server/.env` file; it was not printed and is not included in this report or documentation.
- **MongoDB**: the local service has authentication disabled and no users in the `admin` database. The application connects without credentials to database `syncsphere`. This is acceptable for the local Task 14 service only.
- **Redis**: the local service has no `requirepass` configured. The application connects without credentials to database `0`. This is acceptable for the local Task 14 service only.
- The pre-existing `syncsphere` MySQL user and the empty-password root account were not used by the application.

## 4. Environment Variables Activated
`server/.env` was updated in place. Existing authentication secrets and all working settings were preserved.

Activated values, without secrets:

```text
DATABASE_STARTUP_POLICY=required
DATABASE_CONNECT_TIMEOUT=10000
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3307
MYSQL_USER=<dedicated local application user>
MYSQL_PASSWORD=<generated local password; redacted>
MYSQL_DATABASE=syncsphere
MYSQL_CONNECTION_LIMIT=10
MYSQL_CONNECT_TIMEOUT=10000
MYSQL_SSL=false
MONGODB_URI=mongodb://127.0.0.1:37017/syncsphere
MONGODB_DATABASE=syncsphere
MONGODB_MAX_POOL_SIZE=10
MONGODB_SERVER_SELECTION_TIMEOUT=10000
REDIS_URL=redis://127.0.0.1:16379
REDIS_CONNECT_TIMEOUT=10000
REDIS_MAX_RETRIES=5
```

The actual username and password are present in `server/.env` only. The file remains Git-ignored and unstaged.

## 5. Startup Policy
- `DATABASE_STARTUP_POLICY=required` is enabled.
- Configuration requires all three dependencies: `mysql`, `mongodb`, and `redis`.
- This was enabled only after all three services and their credentials/mechanisms were confirmed.

## 6. Application Connection Using `server/.env`
- `npm run migrate` was run from `server/` and loaded `server/.env` through the existing `--env-file-if-exists=.env` script.
- Migration run result: MySQL, MongoDB, and Redis all connected; migrations `001_auth_schema` and `002_auth_seed` were already applied and were skipped. No migration was reapplied or reversed.
- Application startup was exercised through the same `startServer()` runtime path used by `npm start`, with `server/.env` loaded via `--env-file=.env`.
- No database connection variables were supplied through shell overrides for these verifications.
- A local Windows loopback preload was used only as a networking workaround; it does not provide or override any database configuration.

## 7. Health, Readiness, and Shutdown
| Check | Result |
| --- | --- |
| `GET /api/v1/health` | `200`, `status: healthy` |
| `GET /api/v1/health/live` | `200`, `status: alive` |
| `GET /api/v1/health/ready` | `200`, `status: ready` |
| Readiness dependencies | `mysql: connected`, `mongodb: connected`, `redis: connected` |
| Graceful shutdown | `SIGTERM` handled, HTTP closed, shutdown order `redis → mongodb → mysql`, exit code `0` |

## 8. Authentication and Session Test Results
- Full real integration suite: **6 files / 32 tests passed** using values loaded from `server/.env`.
- Authentication flow: **6/6 passed**:
  - registration persists a user in MySQL;
  - login, access-token authentication, and current session retrieval;
  - separate session revocation and access-token rejection;
  - refresh-token rotation, reuse detection, and family revocation;
  - logout and revoked-token rejection;
  - no active refresh sessions remain for the disposable user.
- Redis integration: **6/6 passed**, including auth revocation cache entries, rate-limit store operations, TTL expiry, reconnect behavior, and fail-closed/fallback behavior.
- No security controls were weakened to make tests pass.

## 9. Lint and Test Results
- `npm run lint`: passed.
- `npm test`: **24 files / 183 tests passed**.
- `npm run test:integration` equivalent with `server/.env` loaded: **6 files / 32 tests passed**.
- `npm run migrate`: passed; no schema changes were applied because migrations were current.

## 10. Remaining Blockers
- Docker Compose runtime remains unverified because Docker is unavailable and `infrastructure/.env` does not exist.
- The active database services are the temporary local Task 14 processes, not managed system services. They stopped once during this task and had to be restarted from the same data directories.
- On this Windows host, the local loopback preload workaround is still required for stable socket connections; it is not part of application configuration.
- MongoDB and Redis are intentionally no-auth local services. Production requires authenticated, TLS-enabled endpoints.
- Compose credential placeholders and production secrets were not created or modified.

**Conclusion:** real direct connections to MySQL, MongoDB, and Redis were activated through `server/.env`, with `DATABASE_STARTUP_POLICY=required`, successful startup/readiness/shutdown, and passing authentication/integration tests. The Compose-based stack remains a separate, unverified configuration path.
