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

## First-Time Setup

1. Copy the example environment file:

   ```powershell
   Copy-Item infrastructure/.env.example infrastructure/.env
   ```

2. Replace every `replace-with-*` placeholder in `infrastructure/.env`.
   Use strong local-only passwords. Do not commit `infrastructure/.env`.

3. Start the services from the repository root:

   ```powershell
   docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml up -d
   ```

4. Wait for all health checks to pass:

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
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml down
```

To reset local data, remove the named volumes explicitly. This is destructive
and should only be used for disposable local environments:

```powershell
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml down -v
```

## Connection Strings

Use the values from `infrastructure/.env` when starting the backend or running
integration tests.

MySQL:

```text
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=syncsphere
MYSQL_PASSWORD=<MYSQL_PASSWORD>
MYSQL_DATABASE=syncsphere
```

MongoDB application user:

```text
MONGODB_URI=mongodb://syncsphere:<MONGODB_APP_PASSWORD>@127.0.0.1:27017/syncsphere?authSource=syncsphere
MONGODB_DATABASE=syncsphere
```

Redis:

```text
REDIS_URL=redis://:<REDIS_PASSWORD>@127.0.0.1:6379
```

The integration test defaults are credential-free and target the default ports.
Always set the `MYSQL_*`, `MONGODB_URI`, and `REDIS_URL` shell variables when
using the Compose stack with passwords.

## Integration Tests

Integration tests use real services and are separate from unit tests:

```powershell
Set-Location server

$env:MYSQL_HOST = '127.0.0.1'
$env:MYSQL_PORT = '3306'
$env:MYSQL_USER = 'syncsphere'
$env:MYSQL_PASSWORD = '<MYSQL_PASSWORD>'
$env:MYSQL_DATABASE = 'syncsphere'
$env:MONGODB_URI = 'mongodb://syncsphere:<MONGODB_APP_PASSWORD>@127.0.0.1:27017/syncsphere?authSource=syncsphere'
$env:MONGODB_DATABASE = 'syncsphere'
$env:REDIS_URL = 'redis://:<REDIS_PASSWORD>@127.0.0.1:6379'

npm run test:integration
```

Useful commands:

```powershell
npm test                    # unit tests only
npm run test:integration    # real database integration tests
npm run test:integration:watch
```

The integration tests create uniquely named rows, collections, and Redis keys.
They clean up only the data they create and do not truncate shared databases.

## Safety Rules

- Never run destructive database commands against shared or production data.
- Never commit `infrastructure/.env` or real credentials.
- Keep database ports bound to `127.0.0.1` for local development.
- Do not remove named volumes unless you intend to delete local data.
- Do not treat the local Compose passwords as production secrets.

## Local Windows Verification Note

The repository integration suite was also exercised against locally installed
services without Docker on Windows. Because that host exhibited a loopback
source-port reuse issue (`EADDRINUSE` on repeated loopback connections), the
verification run used a temporary, non-committed Node preload that assigned a
unique local port to loopback connections. That workaround is specific to the
host and is not part of the application or the test suite. On a normal Docker
host, run the commands above without any preload.

If loopback connections fail with `EADDRINUSE` on Windows:

- Re-run the suite after the operating system releases stale TCP connections.
- Prefer the Docker Compose stack, which avoids the host-level port reuse issue.
- Do not add local-port workarounds to production code.
