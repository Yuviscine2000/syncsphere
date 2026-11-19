# Task 18 – Docker Compose Runtime Setup, Database Migration & Verification Report

## 1. Docker Runtime Status
- Docker Desktop: `4.99.0.245822`, installed under
  `C:\Users\yuvar\AppData\Local\Programs\DockerDesktop`.
- Docker Engine: `29.9.3`; `OSType=linux` confirmed.
- Docker Compose: `v5.7.0`.
- WSL2: running; `docker-desktop` distribution is Running.
- `docker run hello-world` was already confirmed on this host by the environment
  owner; this task did not rerun it.
- The Docker CLI is not on the current `PATH`, so all Docker commands used the
  explicit binary at
  `C:\Users\yuvar\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe`
  with its adjacent `resources\bin` directory added to `PATH` for credential
  helpers.
- Docker CLI, Engine, and Compose were rechecked directly and are operational.

## 2. Compose Service Status
- `docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml config --quiet` passed.
- `docker compose up -d` created the `syncsphere-data` bridge network, three named
  volumes, and three containers.
- Final status after startup and after non-destructive restart:

| Service | Container | Image | Status | Health |
| --- | --- | --- | --- | --- |
| MySQL | `syncsphere-mysql` | `mysql:8.0` | Up | `healthy` |
| MongoDB | `syncsphere-mongodb` | `mongo:7.0` | Up | `healthy` |
| Redis | `syncsphere-redis` | `redis:7.4-alpine` | Up | `healthy` |

- All services use `restart: unless-stopped`.
- All services are attached to the `syncsphere-data` bridge network.
- MongoDB has a read-only bind mount for the init script, a named data volume at
  `/data/db`, and an internal configdb volume.
- No application container was added; the backend remains a host process as
  required by the existing architecture.

## 3. Host Port Mappings
Pre-flight port audit:

| Port | Status | Owner / Note |
| ---: | --- | --- |
| `3306` | In use | Unknown `mysqld.exe` PID `7036`; not touched. |
| `27017` | In use | Unknown `mongod.exe` PID `5980`; not touched. |
| `6379` | Free | Default Compose Redis port, not used. |
| `3307` | In use | Known Task 14 temporary MySQL; not touched. |
| `37017` | In use | Known Task 14 temporary MongoDB; not touched. |
| `16379` | In use | Known Task 14 temporary Redis; not touched. |
| `3308` | Free | Selected Compose MySQL host port. |
| `27018` | Free | Selected Compose MongoDB host port. |
| `6380` | Free | Selected Compose Redis host port. |

Active localhost-only mappings:

| Service | Host mapping | Container port |
| --- | --- | ---: |
| MySQL | `127.0.0.1:3308->3306/tcp` | `3306` |
| MongoDB | `127.0.0.1:27018->27017/tcp` | `27017` |
| Redis | `127.0.0.1:6380->6379/tcp` | `6379` |

No unknown Windows database process was stopped or modified.

## 4. Database Authentication Verification
- MySQL application user `syncsphere` verified from inside the container:
  - `GRANT USAGE ON *.*`
  - `GRANT ALL PRIVILEGES ON syncsphere.*`
  - No global privileges granted.
- MongoDB application user verified through `connectionStatus`:
  - authenticated user `syncsphere` on database `syncsphere`;
  - role `readWrite` on database `syncsphere`.
- Redis:
  - unauthenticated `PING` returned `NOAUTH Authentication required.`;
  - authenticated `PING` returned `PONG`;
  - container health check authenticates successfully.
- Compose validation used `config --quiet`; resolved credentials were not printed.
- Generated passwords are strong, unique, local-only values stored only in
  ignored environment files. No password, token, or secret value is included in
  this report.

## 5. Named Volume and Persistence Verification
Volumes created and attached:

| Service | Named volume | Mount path |
| --- | --- | --- |
| MySQL | `syncsphere_mysql_data` | `/var/lib/mysql` |
| MongoDB | `syncsphere_mongodb_data` | `/data/db` |
| Redis | `syncsphere_redis_data` | `/data` |

Persistence test:

- Before restart: MySQL `schema_migrations=2`, `roles=4`.
- Created disposable test records:
  - MongoDB document `_id=task18-check` in `task18_persistence_check`;
  - Redis key `task18:persistence:check` with a one-hour TTL.
- Restart used non-destructive `docker compose stop` followed by
  `docker compose start`. No `down`, `down -v`, pruning, or volume deletion was
  used.
- After restart:
  - all three containers returned to `healthy`;
  - MySQL `schema_migrations=2`, `roles=4`;
  - MongoDB test document was present;
  - Redis test key returned `ok` with TTL still counting down.
- Disposable MongoDB and Redis test records were removed after verification. No
  application data was reset.

## 6. Backend Environment Alignment
- `infrastructure/.env` was created from the example and confirmed ignored by
  Git (`.gitignore:25`).
- A secure local backup of `server/.env` was created at
  `server/.env.bak.compose-20261119`; the backup is ignored by Git and its
  contents were not printed.
- `server/.env` was updated to the Compose-backed configuration:
  - `DATABASE_STARTUP_POLICY=required`;
  - MySQL `127.0.0.1:3308`, user `syncsphere`, database `syncsphere`;
  - MongoDB authenticated URI to `127.0.0.1:27018` with
    `authSource=syncsphere`;
  - Redis authenticated URL to `127.0.0.1:6380`.
- Passwords in MongoDB and Redis URLs were URL-encoded.
- Authentication secrets and unrelated configuration were preserved.
- No database values were supplied through shell overrides. The HTTP port was
  temporarily overridden to `3100` for one health harness run only because an
  unrelated local `node` process already owns port `3000`; that process was not
  stopped.

## 7. Migration Results
- Command run from `server/`: `node --env-file=.env scripts/migrate.js`.
- All three dependencies initialized and connected through the Compose published
  ports.
- Migrations applied:
  - `001_auth_schema` — 6 statements;
  - `002_auth_seed` — 6 statements.
- Migration command completed successfully and shut down dependencies in the
  order `redis -> mongodb -> mysql`.

## 8. Health/Readiness Results
Backend startup ran through the real `startServer()` lifecycle with `.env`
loaded and no Windows loopback preload.

- `/api/v1/health` — `200`, `status=healthy`.
- `/api/v1/health/live` — `200`, `status=alive`.
- `/api/v1/health/ready` — `200`, `status=ready`, with:
  - `mysql=connected`
  - `mongodb=connected`
  - `redis=connected`
- Graceful shutdown was triggered with `SIGTERM`; resources closed in order
  `redis -> mongodb -> mysql`; process exited `0`.

## 9. Unit and Integration Test Results
- `npm run lint` — passed.
- `npm test` — passed: `24` files, `183` tests.
- Compose-backed integration suite — passed: `6` files, `32` tests.
- Integration command used:
  `node --env-file=.env ./node_modules/vitest/vitest.mjs run --config vitest.integration.config.js`.
- The suite ran without the previous Windows port-allocation preload workaround.
- Two test-support fixes were required for authenticated Compose services:
  - the Redis reconnect proxy now preserves the source Redis URL credentials;
  - the auth-flow test resets loopback auth rate-limit counters before and after
    the suite so repeated runs are deterministic.

## 10. Authentication/RBAC Test Results
Executed and passed inside the Compose-backed integration suite:

- registration persists a disposable user in MySQL;
- login authenticates an access token and lists the current session;
- separate session revocation rejects its access token;
- refresh token rotation, reuse detection, and token-family revocation;
- logout revokes the session and rejects the revoked access token;
- no active refresh sessions remain for the disposable user;
- Redis rate-limit store increments, reads, decrements, and resets;
- Redis auth revocation cache entries;
- Redis reconnects after a real network interruption;
- Redis fails closed when unavailable;
- MySQL transactions commit and roll back;
- MySQL duplicate-key and foreign-key constraints are enforced;
- MongoDB CRUD, unique index creation, duplicate rejection, reconnect, and
  closed-client rejection.

RBAC authorization is covered by the unit suite (`auth-routes.test.js`), which
passed in the `183` unit tests. There is no separate RBAC integration test file
in the existing suite.

## 11. Files Modified
Tracked/workspace files changed by this task:

- `infrastructure/.env` — created, ignored local Compose credentials.
- `server/.env` — aligned to Compose services; ignored.
- `server/.env.bak.compose-20261119` — secure ignored backup.
- `server/tests/integration/support/redis-proxy.js` — preserve source Redis URL
  credentials through the proxy.
- `server/tests/integration/redis.integration.test.js` — pass source URL to the
  proxy.
- `server/tests/integration/auth-flow.integration.test.js` — reset loopback auth
  rate-limit counters for deterministic repeated runs.
- `docs/infrastructure/database-services.md` — active Compose configuration,
  environment setup, health/migration commands, volumes, backup/restore
  guidance, stop/down/down -v differences, and Windows/WSL2 troubleshooting.
- `docs/configuration/environment.md` — active Compose values and explicit
  `.env`-loaded integration command.
- `TASK-18-DOCKER-SETUP-AND-MIGRATION-REPORT.md` — this report.

An empty transient `dump.rdb` snapshot created in the repository root during
verification was removed after confirming it contained no database keys.
No application architecture, authentication implementation, security model, or
API contract was changed.

## 12. Remaining Limitations and Blockers
- None blocking Task 18.
- Local Compose setup is for development and integration testing only; no
  production deployment or production-readiness claim is made.
- Docker CLI is installed but not on the default `PATH`; troubleshooting docs
  now explain the explicit path used on this host.
- Port `3000` is occupied by an unrelated local Node process, so the backend
  health harness used temporary HTTP port `3100`. DB settings still came only
  from `server/.env`.
- The Task 14 direct services and unknown Windows database services remain
  running and untouched.
- Production secrets, TLS, backups at rest, HA/DR, monitoring, alerting, and
  failover runbooks remain outside this local task.

## 13. Safety Confirmation
- No Git staging, commits, pushes, or history changes were performed.
- No Docker volumes were removed; no `down -v`, pruning, or destructive reset
  commands were used.
- No unknown Windows database process or Task 14 service was stopped or
  modified.
- No existing application database data was deleted. Only disposable test
  records and ephemeral test rate-limit counters created by verification were
  cleaned up.
- No password, token, or secret value is printed in this report or committed
  documentation.
