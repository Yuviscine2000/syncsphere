# Environment Configuration

The SyncSphere API validates its environment with Zod at startup. Invalid
configuration fails fast with a configuration error.

## Loading Rules

The npm scripts load `server/.env` when present:

```text
npm run dev
npm start
npm run migrate
npm run provision:admin
```

They use `node --env-file-if-exists=.env`, so the application also starts
without a `.env` file when the required variables are supplied by the shell or
deployment platform. Shell environment variables take precedence over values in
`.env`.

Integration tests use `vitest` directly and do not load `.env`. Run them with
`node --env-file=.env ./node_modules/vitest/vitest.mjs run --config
vitest.integration.config.js` from `server/` instead of passing database values
through shell overrides.

Never commit `server/.env` or `infrastructure/.env`. Both are ignored by Git.
Commit only `.env.example` files with safe placeholders.

## Local Setup

### 1. Configure database services

Create `infrastructure/.env` from the example and replace every placeholder:

```powershell
Copy-Item infrastructure/.env.example infrastructure/.env
```

Start the local stack:

```powershell
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml up -d
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml ps
```

See [Local Database Services](../infrastructure/database-services.md) for the
full service workflow.

### 2. Configure the API

Create `server/.env` from the example if it does not exist:

```powershell
Copy-Item server/.env.example server/.env
```

Generate two independent authentication secrets:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Set the first value as `AUTH_ACCESS_TOKEN_SECRET` and the second as
`AUTH_CSRF_SECRET`. Do not reuse the same value.

Set the database values from `infrastructure/.env`:

```text
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3308
MYSQL_USER=syncsphere
MYSQL_PASSWORD=<MYSQL_PASSWORD from infrastructure/.env>
MYSQL_DATABASE=syncsphere
MONGODB_URI=mongodb://syncsphere:<MONGODB_APP_PASSWORD from infrastructure/.env>@127.0.0.1:27018/syncsphere?authSource=syncsphere
MONGODB_DATABASE=syncsphere
REDIS_URL=redis://:<REDIS_PASSWORD from infrastructure/.env>@127.0.0.1:6380
```

Uncomment the database block only after real local credentials are available.
Do not invent credentials or copy production secrets into local files.

### Active local Compose configuration

The current local setup uses the Docker Compose stack. The verified endpoints
are:

- MySQL: `127.0.0.1:3308`, database `syncsphere`, dedicated application user
  with privileges scoped to that database.
- MongoDB: `127.0.0.1:27018`, database `syncsphere`, application user with
  `authSource=syncsphere`.
- Redis: `127.0.0.1:6380`, database `0`, password required.

These values are active in `server/.env` with
`DATABASE_STARTUP_POLICY=required`. Generated local credentials are stored only
in ignored environment files and must never be copied into documentation,
examples, or shell history. All `server` npm scripts load `server/.env`
automatically; integration tests need the explicit `--env-file` runner command
documented above.

The Task 14 direct services remain installed and untouched but are no longer
the backend targets. See
[Local Database Services](../infrastructure/database-services.md) for the
prerequisites, backup guidance, and safe migration steps.

### 3. Run migrations and start the API

```powershell
Set-Location server
npm run migrate
npm run dev
```

## Configuration Reference

### Server

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production`. |
| `PORT` | No | `3000` | Integer `0-65535`; `0` selects an ephemeral port. |
| `API_PREFIX` | No | `/api` | Normalized to a leading slash without a trailing slash. |
| `CORS_ORIGIN` | Production only | `http://localhost:4200` in development | Comma-separated explicit origins. Wildcards are rejected. |
| `TRUST_PROXY` | No | `false` | `false` or an integer hop count `1-10`. |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` | Integer `1000-86400000`. |
| `RATE_LIMIT_MAX` | No | `100` | Integer `1-1000000`. |
| `BODY_LIMIT` | No | `1mb` | Size such as `100kb`, `1mb`, or `1gb`. |
| `SHUTDOWN_TIMEOUT_MS` | No | `10000` | Integer `1000-60000`. |
| `LOG_LEVEL` | No | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent`. |

### Authentication

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `AUTH_ACCESS_TOKEN_SECRET` | Yes | None | 32-1024 characters. Must differ from the CSRF secret. |
| `AUTH_CSRF_SECRET` | Yes | None | 32-1024 characters. Must differ from the access-token secret. |
| `AUTH_ACCESS_TOKEN_ISSUER` | No | `syncsphere-api` | 1-200 characters. |
| `AUTH_ACCESS_TOKEN_AUDIENCE` | No | `syncsphere-web` | 1-200 characters. |
| `AUTH_ACCESS_TOKEN_TTL_SECONDS` | No | `900` | Integer `60-3600`. |
| `AUTH_ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS` | No | `5` | Integer `0-30`. |
| `AUTH_REFRESH_TOKEN_TTL_SECONDS` | No | `604800` | Integer `300-2592000`. |
| `AUTH_REFRESH_COOKIE_NAME` | No | `syncsphere_refresh` | Letters, numbers, hyphens, and underscores only. |
| `AUTH_CSRF_COOKIE_NAME` | No | `syncsphere_csrf` | Letters, numbers, hyphens, and underscores only. |
| `AUTH_REFRESH_COOKIE_PATH` | No | `/api/v1/auth` | Absolute URL path. |
| `AUTH_CSRF_COOKIE_PATH` | No | `/` | Absolute URL path. |
| `AUTH_REFRESH_COOKIE_DOMAIN` | No | Unset | Cookie domain. Leave unset for host-only cookies. |
| `AUTH_REFRESH_COOKIE_SAME_SITE` | No | `strict` | `strict`, `lax`, or `none`. `none` requires Secure cookies. |
| `AUTH_REFRESH_COOKIE_SECURE` | No | `true` in production; `false` otherwise | Must be `true` in production. |
| `AUTH_PASSWORD_MIN_LENGTH` | No | `12` | Integer `8-256`. |
| `AUTH_PASSWORD_MAX_LENGTH` | No | `128` | Integer `8-256`; must be at least the minimum. |
| `AUTH_ARGON2_MEMORY_KIB` | No | `19456` | Integer `8192-262144`. |
| `AUTH_ARGON2_TIME_COST` | No | `2` | Integer `2-10`. |
| `AUTH_ARGON2_PARALLELISM` | No | `1` | Integer `1-4`. |
| `AUTH_RATE_LIMIT_WINDOW_MS` | No | `900000` | Integer `1000-86400000`. |
| `AUTH_LOGIN_RATE_LIMIT_MAX` | No | `10` | Integer `1-1000`. |
| `AUTH_REGISTER_RATE_LIMIT_MAX` | No | `5` | Integer `1-1000`. |
| `AUTH_REFRESH_RATE_LIMIT_MAX` | No | `60` | Integer `1-1000`. |

### Administrator Provisioning

These variables are used only by `npm run provision:admin`. Prefer passing them
in the shell instead of storing them in `.env`.

| Variable | Required | Notes |
| --- | --- | --- |
| `ADMIN_PROVISION_CONFIRM` | Yes | Must be exactly `YES`. |
| `ADMIN_EMAIL` | Yes | Valid email address, maximum 320 characters. |
| `ADMIN_FULL_NAME` | Yes | 2-120 characters without control characters. |
| `ADMIN_PASSWORD` | Yes | Must satisfy the configured password policy. |

### Database

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_STARTUP_POLICY` | No | `optional` outside production; `required` in production | Production must use `required`. |
| `DATABASE_CONNECT_TIMEOUT` | No | `10000` | Shared fallback timeout, integer `1000-60000`. |
| `MYSQL_HOST` | If MySQL enabled | None | Required when any `MYSQL_*` variable is set. |
| `MYSQL_PORT` | No | `3306` | Integer `1-65535`. |
| `MYSQL_USER` | If MySQL enabled | None | Required when any `MYSQL_*` variable is set. |
| `MYSQL_PASSWORD` | Required when startup policy is `required` | Empty in optional mode | Required when any `MYSQL_*` variable is set under `required`. |
| `MYSQL_DATABASE` | If MySQL enabled | None | Required when any `MYSQL_*` variable is set. |
| `MYSQL_CONNECTION_LIMIT` | No | `10` | Integer `1-1000`. |
| `MYSQL_CONNECT_TIMEOUT` | No | `DATABASE_CONNECT_TIMEOUT` | Integer `1000-60000`. |
| `MYSQL_SSL` | No | `false` | `true` enables certificate verification. |
| `MONGODB_URI` | If MongoDB enabled | None | `mongodb://` or `mongodb+srv://` URI. |
| `MONGODB_DATABASE` | If MongoDB enabled | None | Required when any `MONGODB_*` variable is set. |
| `MONGODB_MAX_POOL_SIZE` | No | `10` | Integer `1-1000`. |
| `MONGODB_SERVER_SELECTION_TIMEOUT` | No | `DATABASE_CONNECT_TIMEOUT` | Integer `1000-60000`. |
| `REDIS_URL` | If Redis enabled | None | `redis://` or `rediss://` URL. |
| `REDIS_CONNECT_TIMEOUT` | No | `DATABASE_CONNECT_TIMEOUT` | Integer `1000-60000`. |
| `REDIS_MAX_RETRIES` | No | `5` | Integer `0-50`. |

A dependency is enabled when any of its variables has a non-empty value.
In `required` mode, all three dependencies must be fully configured and connect
at startup. In `optional` mode, missing or unavailable dependencies are reported
but do not block startup.

## Local Development vs Production

| Setting | Local development | Production |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` |
| `CORS_ORIGIN` | `http://localhost:4200` | Explicit HTTPS origin list; no wildcards |
| `TRUST_PROXY` | `false` | Set only when behind a trusted proxy, using the exact hop count |
| `AUTH_ACCESS_TOKEN_SECRET` | Random local value, at least 32 characters | Independently generated secret from a secret manager |
| `AUTH_CSRF_SECRET` | Different random local value | Different independently generated secret |
| `AUTH_REFRESH_COOKIE_SECURE` | `false` | `true` |
| `AUTH_REFRESH_COOKIE_SAME_SITE` | `strict` | `strict` or `lax`; `none` requires Secure |
| `DATABASE_STARTUP_POLICY` | `optional` | `required` |
| `MYSQL_SSL` | `false` for localhost | `true` unless the network is private and trusted |
| MongoDB URI | `mongodb://` localhost | `mongodb+srv://` or TLS-enabled URI |
| Redis URL | `redis://` localhost | `rediss://` |
| `LOG_LEVEL` | `info` or `debug` | `info`, `warn`, or `error` |
| Database credentials | Local Compose credentials | Secret manager or platform-managed secrets |

Production configuration is rejected when:

- `CORS_ORIGIN` is missing or contains a wildcard.
- `AUTH_REFRESH_COOKIE_SECURE` is not `true`.
- `AUTH_REFRESH_COOKIE_SAME_SITE=none` without Secure cookies.
- `DATABASE_STARTUP_POLICY` is not `required`.
- Required database dependencies are incomplete.
- Authentication secrets are shorter than 32 characters or identical.

## Verification

### Verify configuration parsing

```powershell
Set-Location server
node --env-file=.env --input-type=module -e "import { loadConfig } from './src/config/index.js'; const c = loadConfig(); console.log({ environment: c.nodeEnv, port: c.port, startupPolicy: c.database.startupPolicy, mysql: c.database.mysql !== null, mongodb: c.database.mongodb !== null, redis: c.database.redis !== null });"
```

### Verify database connectivity

```powershell
Set-Location server
npm run migrate
npm run dev
```

Then check the health endpoints:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/v1/health/live
Invoke-RestMethod http://127.0.0.1:3000/api/v1/health/ready
Invoke-RestMethod http://127.0.0.1:3000/api/v1/health
```

Readiness reports each dependency as `connected`, `not_configured`, or
`unavailable`. With `DATABASE_STARTUP_POLICY=optional`, unavailable optional
dependencies do not make the service unready. With `required`, all three must be
connected.

### Verify integration tests

```powershell
Set-Location server
node --env-file=.env ./node_modules/vitest/vitest.mjs run --config vitest.integration.config.js
```

Do not claim real database connectivity unless the services are running and the
commands above succeed.

## Troubleshooting

- `Invalid environment configuration`: check `NODE_ENV`, numeric ranges, and
  enum values.
- `Invalid authentication configuration`: check secret length, secret
  independence, cookie paths, and password bounds.
- `CORS_ORIGIN is required in production`: set explicit HTTPS origins.
- `AUTH_REFRESH_COOKIE_SECURE must be true in production`: set it to `true`.
- `DATABASE_STARTUP_POLICY must be "required" in production`: change the policy.
- `Incomplete MySQL/MongoDB/Redis configuration`: either configure all required
  variables for that dependency or remove all of its variables.
- `DATABASE_STARTUP_POLICY=required requires configured dependencies`: configure
  all three dependencies or use `optional` outside production.
