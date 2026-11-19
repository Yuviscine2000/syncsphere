# Local Database Services

SyncSphere uses MySQL, MongoDB, and Redis. The local stack is defined in
`infrastructure/docker-compose.yml` and is intended for development and
integration testing only.

## Services

| Service | Image | Host port | Container port | Data volume |
| --- | --- | --- | --- | --- |
| MySQL | `mysql:8.0` | `${MYSQL_PORT:-3306}` | `3306` | `syncsphere_mysql_data` |
| MongoDB | `mongo:7.0` | `${MONGODB_PORT:-27017}` | `27017` | `syncsphere_mongodb_data` |
| Redis | `redis:7.4-alpine` | `${REDIS_PORT:-6379}` | `6379` | `syncsphere_redis_data` |

All published ports bind to `127.0.0.1` only. The services share the
`syncsphere-data` bridge network and use health checks before they are
considered ready.

## Docker Desktop Prerequisites

Compose verification requires Docker Desktop for Windows with the Linux
container engine and Compose v2. These are manual prerequisites; the repository
does not install Docker automatically.

1. Install Docker Desktop for Windows from the official Docker documentation:
   <https://docs.docker.com/desktop/install/windows-install/>.
2. Install or enable WSL2 and at least one Linux distribution. Verify the
   installed distributions with `wsl --list --verbose`. If needed, run this in
   an elevated PowerShell, then reboot:

   ```powershell
   wsl --install -d Ubuntu
   ```

3. Start Docker Desktop from the Start menu. Confirm Linux container mode is
   selected in the Docker Desktop tray menu. Do not switch to Windows
   containers for this stack.
4. Verify the installation:

   ```powershell
   docker --version
   docker compose version
   docker info --format "{{.OSType}}"
   ```

   The last command should report `linux`. If any command is missing or fails,
   Docker Desktop is not installed, not running, or not in Linux container
   mode.

## Application Environment

The API reads `server/.env` through `--env-file-if-exists` in the npm scripts.
Set the database values there to match `infrastructure/.env`. The full variable
reference, validation rules, and production checklist are in
[Environment Configuration](../configuration/environment.md).

Integration tests are launched by Vitest directly and do not load `.env`
themselves. Run them with `node --env-file=.env ./node_modules/vitest/vitest.mjs
run --config vitest.integration.config.js` from `server/` so the same values are
used without shell overrides.

Do not put API authentication secrets in `infrastructure/.env`, and do not put
Compose root passwords in `server/.env`.

## Active Compose Configuration

The active local stack is the Docker Compose stack. The currently verified host
ports avoid the unknown services on `3306` and `27017` and the Task 14 direct
services on `3307`, `37017`, and `16379`:

| Service | Endpoint | Authentication | Notes |
| --- | --- | --- | --- |
| MySQL | `127.0.0.1:3308` | Dedicated application user | Database `syncsphere`; privileges are scoped to that database. |
| MongoDB | `127.0.0.1:27018` | Application user | Database `syncsphere`; `authSource=syncsphere`. |
| Redis | `127.0.0.1:6380` | Password required | Database `0`. |

`server/.env` is the single source of truth for the active application
connection settings. It is ignored by Git and contains generated local
credentials; do not print, copy, or document those values. The npm scripts in
`server/` load this file automatically, so do not pass database settings through
shell overrides for normal local startup or migrations. Use the `--env-file`
integration command documented above.

The Task 14 direct services remain installed and untouched; they are no longer
the active backend targets.

## First-Time Setup

1. Copy the example environment file if `infrastructure/.env` does not exist:

   ```powershell
   Copy-Item infrastructure/.env.example infrastructure/.env
   ```

2. Generate strong, unique local-development passwords for every
   `replace-with-*` placeholder in `infrastructure/.env`. Keep the file ignored
   by Git. If the file already exists, preserve its credentials and do not
   overwrite them.

3. Make a secure local backup of `server/.env` before aligning it, then replace
   only the database settings with the matching Compose host ports and
   credentials. Preserve all authentication secrets and unrelated settings.
   URL-encode passwords used inside MongoDB and Redis URIs.

4. Check the host ports selected in `infrastructure/.env` before starting:

   ```powershell
   Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
     Where-Object { $_.LocalPort -in 3306,27017,6379,3307,37017,16379,3308,27018,6380 }
   ```

   If a port is already in use by a service you do not own, do not stop it.
   Choose a free host port in `infrastructure/.env` and update the matching
   value in `server/.env`. On the verified workstation, `3306` and `27017` are
   occupied by unknown local services, the Task 14 services occupy `3307`,
   `37017`, and `16379`, and `3308`, `27018`, and `6380` are free.

5. Validate and start the services from the repository root:

   ```powershell
   docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml config --quiet
   docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml up -d
   ```

6. Wait for all health checks to pass:

   ```powershell
   docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml ps
   ```

MongoDB runs an initialization script from
`infrastructure/mongodb/init/01-create-app-user.js`. It creates the application
user in `MONGODB_DATABASE` with the `readWrite` role. The script runs only when
the MongoDB data volume is empty.

## Start, Stop, and Logs

```powershell
# Start
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml up -d

# Status
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml ps

# Logs
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml logs -f

# Stop without deleting data
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml stop

# Resume the same containers
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml start
```

Command differences:

- `docker compose stop` stops containers but keeps them present. Volumes and
  container metadata remain, and `docker compose start` resumes the same
  containers. This is the preferred non-destructive restart operation.
- `docker compose down` stops and removes the containers and Compose network,
  but preserves named volumes and database data.
- `docker compose down -v` also removes the named volumes. This permanently
  deletes local database data and must not be used for routine shutdowns.

Never use pruning commands or volume deletion commands during normal local
development.

## Connection Strings

Use the values from `infrastructure/.env` when starting the backend or running
integration tests. When switching from the active Task 14 direct-service setup,
replace the no-auth MongoDB and Redis URLs in `server/.env` with the authenticated
Compose forms below, and align the host ports and MySQL user/password with
`infrastructure/.env`. Do not keep the direct-service values after Compose is
started.

MySQL:

```text
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3308
MYSQL_USER=syncsphere
MYSQL_PASSWORD=<MYSQL_PASSWORD>
MYSQL_DATABASE=syncsphere
```

MongoDB application user:

```text
MONGODB_URI=mongodb://syncsphere:<MONGODB_APP_PASSWORD>@127.0.0.1:27018/syncsphere?authSource=syncsphere
MONGODB_DATABASE=syncsphere
```

Redis:

```text
REDIS_URL=redis://:<REDIS_PASSWORD>@127.0.0.1:6380
```

The integration test defaults are credential-free and target the default ports.
Do not rely on those defaults for the authenticated Compose stack. Load
`server/.env` with `node --env-file=.env` instead of passing database values
through shell overrides.

## Integration Tests

Integration tests use real services and are separate from unit tests:

```powershell
Set-Location server
node --env-file=.env ./node_modules/vitest/vitest.mjs run --config vitest.integration.config.js
```

`npm run test:integration` does not load `server/.env` by itself because the
script invokes Vitest directly. Use the command above for Compose-backed runs.

Useful commands:

```powershell
npm test                    # unit tests only
npm run lint                # lint
node --env-file=.env scripts/migrate.js   # explicit .env migration runner
```

The integration tests create uniquely named rows, collections, and Redis keys.
They clean up only the data they create and do not truncate shared databases.

## Verify Connectivity

Start the API with the database variables configured:

```powershell
Set-Location server
npm run migrate
npm run dev
```

Check liveness, readiness, and dependency details:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/v1/health/live
Invoke-RestMethod http://127.0.0.1:3000/api/v1/health/ready
Invoke-RestMethod http://127.0.0.1:3000/api/v1/health
```

Readiness reports each dependency as `connected`, `not_configured`, or
`unavailable`. Configuration success is not the same as connectivity success:
only report a database as verified after these endpoints or the integration
suite pass against a running service.

## Backup and Restore Guidance

Backups are for local recovery and migration checks, not production readiness.
Store backup files outside the repository and never commit them.

Create logical backups from the running containers without exposing passwords:

```powershell
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml exec -T mysql sh -c 'mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > syncsphere-mysql.sql
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml exec -T mongodb sh -c 'mongodump --uri "mongodb://$MONGODB_APP_USERNAME:$MONGODB_APP_PASSWORD@localhost:27017/$MONGODB_DATABASE?authSource=$MONGODB_DATABASE" --archive' > syncsphere-mongodb.archive
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml exec -T redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning --rdb /dev/stdout' > syncsphere-redis.rdb
```

Before any restore:

- stop backend writes and confirm no application process is using the databases;
- verify the backup file is complete and can be read;
- restore into a disposable Compose stack first and run the integration suite;
- never remove volumes, prune Docker data, or use `down -v` as a restore step;
- never overwrite an existing database without a verified backup and explicit
  approval.

Restore procedures are environment-specific. MySQL and MongoDB logical dumps can
be imported into a prepared empty schema/database with their native client
tools. Redis RDB restoration requires replacing the persistence file inside the
Redis volume while the service is stopped, so it must be rehearsed in a
disposable environment before use.

## Production Differences

Local Compose settings are not production settings:

- Use `NODE_ENV=production` and `DATABASE_STARTUP_POLICY=required`.
- Use explicit HTTPS `CORS_ORIGIN` values and `AUTH_REFRESH_COOKIE_SECURE=true`.
- Use independent secrets from a secret manager, not local `.env` values.
- Use `MYSQL_SSL=true`, a TLS-enabled MongoDB URI, and `rediss://` for Redis
  unless the network is private and trusted.
- Do not expose database ports publicly.
- Do not use Compose root passwords or local application passwords in
  production.

## Production Readiness Review

Passing local Docker Compose checks is not production readiness. Before any
production deployment, review:

- independent secrets supplied by a secret manager, not local `.env` files;
- authenticated MySQL, MongoDB, and Redis connections;
- TLS requirements for database and Redis traffic;
- least-privilege database users with only the required privileges;
- secure refresh cookies, explicit HTTPS CORS origins, and secure CSRF settings;
- restricted network exposure with no public database ports;
- persistent storage sizing, backup schedules, restore tests, and retention;
- HA and Primary DC / DR compatibility for the Phase 1 architecture;
- monitoring, alerting, log retention, and incident response;
- capacity planning and failover runbooks.

No production deployment or production-readiness claim is made by the local
Compose workflow.

## Safety Rules

- Never run destructive database commands against shared or production data.
- Never commit `infrastructure/.env` or real credentials.
- Keep database ports bound to `127.0.0.1` for local development.
- Do not remove named volumes unless you intend to delete local data.
- Do not treat the local Compose passwords as production secrets.

## Docker Troubleshooting

- `docker: command not found`: Docker Desktop is not installed, not running, or
  its CLI is not on `PATH`. Install and start Docker Desktop, then open a new
  terminal. If Docker Desktop is installed under
  `C:\Users\<user>\AppData\Local\Programs\DockerDesktop`, add its
  `resources\bin` directory to `PATH` for the current shell.
- `Cannot connect to the Docker daemon`: start Docker Desktop and wait until the
  engine is running. Verify with `docker info`.
- `OSType` is not `linux`: switch Docker Desktop to Linux containers. Do not run
  this stack in Windows container mode.
- WSL2 kernel present but no distributions: install a Linux distribution with
  `wsl --install -d <distribution>` from an elevated PowerShell and reboot.
- Port already allocated: identify the owning process with
  `Get-NetTCPConnection -State Listen -LocalPort <port>`. If it is not yours,
  choose a different host port in `infrastructure/.env` and mirror it in
  `server/.env`. Never stop unknown services automatically.
- Authentication failures after Compose starts: confirm the app credentials in
  `server/.env` match `infrastructure/.env`, including the MongoDB
  `authSource` and the Redis password in the URL. Note that the MongoDB init
  script creates the app user only when the MongoDB volume is first initialized.

## Local Windows Verification Note

The Compose-backed integration suite was executed without the earlier Windows
loopback port preload workaround. Migrations, backend health checks, and all
integration tests connected to the authenticated Compose services using
`127.0.0.1` published ports.

If loopback connections still fail with `EADDRINUSE` on Windows:

- re-run the suite after the operating system releases stale TCP connections;
- confirm no unrelated process owns the selected host port;
- do not add local-port workarounds to application or production code.
