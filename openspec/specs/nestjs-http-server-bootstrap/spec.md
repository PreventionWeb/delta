## ADDED Requirements

### Requirement: HTTP server starts on API_PORT alongside the application context

`initServer()` in `app/init.server.tsx` SHALL bootstrap a NestJS HTTP application via
`NestFactory.create(CoreModule)` and call `app.listen(API_PORT)` where `API_PORT` is
`process.env.API_PORT` parsed as a number, defaulting to `3001` when the variable is absent
or empty. The HTTP server SHALL start after the application context bootstrap completes
successfully. The global prefix `/api/v2` MUST be set on the HTTP app before `listen()` is
called. The existing `applicationContext` bootstrap and `getAppContext()` return value MUST
remain unaffected.

#### Scenario: HTTP server starts with default port when API_PORT is unset

- **GIVEN** `process.env.API_PORT` is undefined
- **WHEN** `initServer()` is called
- **THEN** the NestJS HTTP application SHALL listen on port 3001

#### Scenario: HTTP server starts on the configured port when API_PORT is set

- **GIVEN** `process.env.API_PORT` is `"4001"`
- **WHEN** `initServer()` is called
- **THEN** the NestJS HTTP application SHALL listen on port 4001

#### Scenario: Global prefix is applied

- **GIVEN** the HTTP server has started
- **WHEN** a GET request is sent to `/api/v2/any-unregistered-path`
- **THEN** the response SHALL have status 404 (not 200, and not routing to the Remix handler)

#### Scenario: Application context remains accessible after HTTP bootstrap

- **GIVEN** `initServer()` has completed successfully
- **WHEN** `getAppContext()` is called
- **THEN** it SHALL return a valid `INestApplicationContext` from which providers can be resolved

> **Test requirement:** A dedicated `it()` block MUST call `getAppContext()` after `initServer()`
> resolves and assert it does not throw. This guards against bootstrapHttpServer() accidentally
> overwriting the appContext singleton.

### Requirement: HTTP bootstrap is protected against concurrent calls

The HTTP app bootstrap MUST be guarded by a module-level `httpBootstrapPromise` variable so
that concurrent callers to `initServer()` (e.g. two parallel requests on a cold start) share
the same bootstrap Promise and do not create two separate HTTP servers.

#### Scenario: Concurrent calls share a single bootstrap

- **GIVEN** `initServer()` is called simultaneously from two callers before the first has resolved
- **WHEN** both Promises settle
- **THEN** exactly one NestJS HTTP application instance SHALL exist and both callers SHALL have
  received the same resolved result without error

#### Scenario: Failed bootstrap allows retry

- **GIVEN** the first call to `initServer()` causes the HTTP bootstrap to reject (e.g. port already bound)
- **WHEN** `initServer()` is called again after the rejection
- **THEN** the HTTP bootstrap SHALL be attempted again (the rejected Promise SHALL NOT be re-awaited)

### Requirement: HTTP server start is logged as a structured info event

After `app.listen()` resolves successfully, `initServer()` SHALL emit a structured `console.info`
call with at minimum the fields `msg` (describing the server-start event) and `port` (the numeric
port the server is listening on). Internal error details SHALL NOT be included in this log line.

#### Scenario: Structured log on successful start

- **GIVEN** `initServer()` completes without error
- **WHEN** the log output is inspected
- **THEN** a log line SHALL contain both the text describing server start and the port number

> **Test requirement:** A dedicated `it()` block MUST spy on `console.info` and assert it was
> called with an object containing both `msg` (server start description) and `port` (numeric).
> The spy must be set up before `initServer()` is called and restored after.
