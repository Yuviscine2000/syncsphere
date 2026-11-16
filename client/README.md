# Syncsphere

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.3.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Authentication

The Angular client integrates with the Express auth API at `http://localhost:3000/api/v1` in development and `/api/v1` in production. Start the backend and its configured MySQL/Redis services before testing login, registration, refresh, or logout against a live server.

- Access tokens are held in memory only and are never written to `localStorage` or `sessionStorage`.
- Refresh tokens stay in backend-managed `HttpOnly` cookies; Angular never reads them.
- `authTokenInterceptor` adds `Authorization: Bearer <token>` and `withCredentials` to API requests, except login, register, and refresh.
- `csrfInterceptor` adds `X-CSRF-Token` to refresh and logout requests.
- `refreshInterceptor` handles one coordinated refresh for concurrent `401` responses and retries each request once.
- `restoreSession()` runs during application startup and uses the refresh cookie to restore the session. The CSRF token is mirrored in `sessionStorage` under `syncsphere.csrf` because the backend CSRF cookie path (`/api/v1/auth`) is not visible to SPA routes.
- `authGuard`, `guestGuard`, and `permissionGuard` protect routes. Admin navigation is hidden without `admin:access`, but backend authorization remains authoritative.
- Login and registration use the backend error envelope and display safe, mapped messages. Registration navigates to login with `registered=1` and the registered email.

Environment values live in `src/environments/environment.ts` and `environment.production.ts`; production file replacement is configured in `angular.json`.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests once with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
npm test -- --watch=false
```

The frontend does not currently define a lint script. Run `npm run build` to type-check and verify the production bundle.

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
