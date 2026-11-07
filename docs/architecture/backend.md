# Backend

What exists in `/backend` after Spec #1 (M0 + M1). Vocabulary: [`GLOSSARY.md`](../../GLOSSARY.md).
Rules: [`CODING_STANDARDS.md`](../../CODING_STANDARDS.md). Sync specifics: [`sync.md`](sync.md).

## Stack

- Spring Boot 3.5 (`backend/build.gradle.kts`), Java 21 toolchain, Gradle wrapper with Kotlin DSL.
- Spring Web, Security, Data JPA, Actuator (only `health` exposed), Spring Session JDBC, Spring
  Modulith 1.4 (BOM), Flyway pinned to 11.20.3 for PostgreSQL 18 support.
- javac runs with `-Xlint:all -Werror` plus Error Prone: every warning fails the build. A
  `@SuppressWarnings` needs a reason.
- Spotless: google-java-format for Java, ktfmt (Google style) for `*.gradle.kts`. Run
  `./gradlew spotlessApply` before committing; CI runs `spotlessCheck`.
- `processResources` copies `web/src/shared/palette/childColors.json` into the jar as
  `palette/childColors.json` (the Child color palette is defined once, in the web app).

## Configuration

`backend/src/main/resources/application.yml` reads environment variables only (A2):

| Variable                                                            | Default           | Used for                                                  |
| ------------------------------------------------------------------- | ----------------- | --------------------------------------------------------- |
| `DATASOURCE_URL`, `DATASOURCE_USERNAME`, `DATASOURCE_PASSWORD`      | none (required)   | PostgreSQL                                                |
| `SESSION_TIMEOUT`                                                   | `180d`            | session timeout and cookie `Max-Age`                      |
| `TRUSTED_PROXIES`                                                   | empty             | regex of proxy addresses whose `X-Forwarded-*` is trusted |
| `INVITE_TTL`                                                        | `7d`              | `InviteService`                                           |
| `PASSWORD_RESET_TTL`                                                | `1h`              | `PasswordResets`                                          |
| `DOMAIN`                                                            | `localhost`       | links `https://<DOMAIN>/invite/…` and `/reset-password/…` |
| `LOGIN_LIMIT_PER_EMAIL`, `LOGIN_LIMIT_PER_IP`, `LOGIN_LIMIT_WINDOW` | `10`, `20`, `15m` | `LoginLimits`                                             |

Durations use Spring's format (`180d`, `15m`, `1h`). `spring.jpa.hibernate.ddl-auto` is `validate`
and `open-in-view` is off. A new setting needs a line in `deploy/.env.example` and in the `app`
service's `environment:` in `deploy/docker-compose.yml` (see [`deployment.md`](deployment.md)).

## Modules

The application package is `io.github.aborgatin.familyapp` (main class `FamilyAppApplication`).
Each top-level sub-package is a Spring Modulith module; its root package is its public API and its
sub-packages are internal (M1). `ModularityTest` runs `ApplicationModules.verify()`.

| Module    | Public API (root package)                            | Internal                                                            |
| --------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| `family`  | `PasswordResets` (+ record `NewPasswordReset`)       | `family.auth`, `family.member`, `family.child`, `family.childfield` |
| `error`   | `ApiException`, `ApiError`, `FieldErrors`            | `error.internal.ApiExceptionHandler`                                |
| `command` | `Commands` (called from `FamilyAppApplication.main`) | `PasswordResetCommand` (package-private)                            |
| `webapp`  | none                                                 | `WebBundleConfig`                                                   |

Dependencies: `family → error`, `command → family`. Nothing in Java owns the Version sequence or
trigger: they are database objects from `V1` (see [`sync.md`](sync.md)).

### `family`

Owns Family, Member, Invite, Password reset, Child and Child field, plus authentication, because
Members are the principals. Sub-packages:

- `family.auth`: everything web and security: `SecurityConfig`, `SessionLogin`,
  `SlidingSessionCookieFilter`, `LoginLimits`, `ApiErrorWriter`, `AuthenticatedMember` and the
  controllers `AuthController` (`/api/auth`), `InvitesController` (`/api/invites`),
  `MembersController` (`/api/members`), `PasswordResetController` (`/api/password-resets`).
- `family.member`: `Member`, `Invite`, `PasswordReset` entities and repositories; `BootstrapService`,
  `LoginService`, `MemberService`, `InviteService`; `RegistrationRequest` (registration body and the
  shared static checks `checkPassword`, `checkDisplayName`, `checkGrammaticalGender`);
  `OneTimeTokens`; `FamilyLock`; `PasswordEncoderConfig`.
- `family.child`: `Child`, `ChildService`, `ChildValidator`, `ChildColorPalette`,
  `ChildrenController` (`/api/children`).
- `family.childfield`: `ChildField`, `ChildFieldService`, `ChildFieldRequest`, `ValueType`
  (`TEXT`, `DATE`), `ChildFieldsController` (`/api/child-fields`).

`PasswordResets` is public so the `command` module can create resets, and so a later
«Сбросить пароль» action in Settings can reuse it: `createForEmail(email)`, `expiresAt(token)`,
`complete(token, newPassword)`. It does not end sessions; `PasswordResetController` does.

There is no public "current Member" or "Member by id" API yet. Controllers get the Member id from
`@AuthenticationPrincipal AuthenticatedMember`, which is internal to `family.auth`. The first module
outside `family` that needs a Member adds that API to the `family` root package.

Shared patterns inside `family`:

- **`FamilyLock.lock()`** runs `SELECT id FROM family FOR UPDATE` and returns the Family id. It
  needs a surrounding transaction. Bootstrap, Invite acceptance, `ChildService.put/delete` and
  `ChildFieldService.put` take it first, so check-then-insert races run one after another.
- **One-time tokens** (`OneTimeTokens`): 32 random bytes, base64url without padding. Only the
  SHA-256 hash is stored (`token_hash BYTEA`). Used by Invites and Password resets.
- **Validation** collects every bad field in a `FieldErrors` and throws once. Body records read
  every field as a nullable `String`, so a missing or unknown enum value becomes a field code, not a
  parse error.

### `command`

Operator commands run from the same image. `FamilyAppApplication.main` checks
`Commands.isCommand(args)`; if so, `Commands.run` starts the context with
`WebApplicationType.NONE` (no port, so it can run next to the live app), runs the command and exits
with its code (0 ok, 1 failed, 2 usage). The only command is `reset-password <email>`
(`PasswordResetCommand`); see [`deployment.md`](deployment.md#password-reset).

Because commands start without a web server, every web-only bean must be
`@ConditionalOnWebApplication`: `SecurityConfig`, `SessionLogin`, `SlidingSessionCookieFilter`,
`WebBundleConfig` and every controller are. A new controller or web component without it breaks the
command; `PasswordResetCommandTest` catches that.

### `webapp`

`WebBundleConfig` serves the web bundle from `classpath:/static/` (the Dockerfile copies `web/dist`
there):

- Any `GET`/`HEAD` outside `/api` and `/actuator` is answered from the bundle: the file if it
  exists, else `index.html` (SPA fallback).
- `/assets/**` (hashed file names): `Cache-Control: max-age=31536000, public, immutable`; a missing
  asset is a plain 404.
- Every other bundle file (`index.html`, `sw.js`, `manifest.webmanifest`, icons): `no-cache`.
- It has its own `SecurityFilterChain` at `@Order(HIGHEST_PRECEDENCE)` matching only those bundle
  requests (`permitAll`, Security's cache headers disabled). Everything else falls to
  `SecurityConfig`'s chain.
- `server.mime-mappings` maps `webmanifest` to `application/manifest+json`.

## API conventions

- JSON under `/api`, camelCase fields, timestamps ISO-8601 UTC, dates `YYYY-MM-DD`, ids UUID strings.
- Syncable resources (`Member`, `Child`, `ChildField`) always carry `id`, `version`, `updatedAt`.
  List endpoints return non-deleted rows only.
- Writes to Children and Child fields are idempotent upserts by client UUID: `PUT /…/{id}` creates
  or fully replaces, `DELETE /…/{id}` soft-deletes and returns `204` even for an unknown or already
  deleted id, and a `PUT` to a soft-deleted id returns `409 <entity>.deleted` without bringing it
  back. Details in [`sync.md`](sync.md).
- Endpoints (all need a session unless marked public):

| Endpoint                                                       | Notes                                                                              |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /api/auth/session` (public)                               | `{bootstrapRequired, member}`; issues the `XSRF-TOKEN` cookie                      |
| `POST /api/auth/bootstrap` (public)                            | first Member only; `201 Member`, logs in                                           |
| `POST /api/auth/login` (public)                                | `200 Member`, logs in                                                              |
| `POST /api/auth/logout`                                        | `204`; ends this device's session only                                             |
| `GET/POST /api/invites`, `DELETE /api/invites/{id}`            | list active / create (response has `url`) / revoke                                 |
| `GET /api/invites/by-token/{token}` (public)                   | `{expiresAt}` or the Invite's state error                                          |
| `POST /api/invites/by-token/{token}/accept` (public)           | `201 Member`, logs in                                                              |
| `GET /api/members`, `PATCH /api/members/me`                    | list (by display name, then email) / change own `displayName`, `grammaticalGender` |
| `POST /api/members/me/password`                                | `204`; other sessions stay                                                         |
| `GET /api/children`, `PUT/DELETE /api/children/{id}`           | ordered by birthday (oldest first, none last), name, id                            |
| `GET /api/child-fields`, `PUT/DELETE /api/child-fields/{id}`   | ordered by `position`, then id                                                     |
| `GET /api/password-resets/by-token/{token}` (public)           | `{expiresAt}` or the reset's state error                                           |
| `POST /api/password-resets/by-token/{token}/complete` (public) | `200 Member`; ends all the Member's sessions, then logs in                         |
| `GET /actuator/health` (public)                                | container healthcheck                                                              |

## Errors

Every error body is `{"code": "<stable.code>", "params": {…}}`, never natural-language text (I1).

- Throw `new ApiException(HttpStatus, code[, params])` from anywhere.
- For field validation, collect into `FieldErrors` (`add(field, code)`, then `throwIfAny()`), which
  throws `400 validation.failed` with `params.errors = [{field, code}, …]`.
- `error.internal.ApiExceptionHandler` (`@RestControllerAdvice`) is the single mapping for MVC:
  `ApiException` as is; unreadable JSON and a path value of the wrong type (e.g. a non-UUID id) →
  `400 request.invalid`; Spring's own `ErrorResponse` exceptions → `not_found`,
  `method.not_allowed`, `request.invalid` or `internal.error` by status; anything else is logged and
  becomes `500 internal.error`.
- Security failures never reach a controller; `family.auth.ApiErrorWriter` writes the same shape
  from `SecurityConfig`'s entry point and access-denied handler.

### Catalogue

| Status | Code                                              | When                                                                          |
| ------ | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| 400    | `validation.failed`                               | field errors in `params.errors`                                               |
| 400    | `request.invalid`                                 | unreadable body, wrong path value type, other 4xx from Spring                 |
| 400    | `auth.invalid_credentials`                        | wrong current password in `POST /api/members/me/password`                     |
| 401    | `auth.required`                                   | no session (also a session whose Member no longer exists, in `MemberService`) |
| 401    | `auth.invalid_credentials`                        | login: unknown email or wrong password (same answer)                          |
| 403    | `auth.csrf_invalid`                               | missing or wrong `X-XSRF-TOKEN`                                               |
| 403    | `auth.forbidden`                                  | any other access denial (no current endpoint produces it)                     |
| 404    | `not_found`                                       | no handler for the path                                                       |
| 404    | `invite.not_found`                                | unknown Invite id or token                                                    |
| 404    | `password_reset.not_found`                        | unknown reset token                                                           |
| 405    | `method.not_allowed`                              | wrong HTTP method                                                             |
| 409    | `auth.bootstrap_closed`                           | bootstrap after the first Member exists                                       |
| 409    | `member.email_taken`                              | Invite acceptance with an email any Member row has (removed ones included)    |
| 409    | `child.deleted`, `child_field.deleted`            | `PUT` to a soft-deleted id                                                    |
| 409    | `child_field.value_type_immutable`                | `PUT` changing an existing Child field's `valueType`                          |
| 410    | `invite.used`, `invite.revoked`, `invite.expired` | Invite link no longer works (checked in that order)                           |
| 410    | `password_reset.used`, `password_reset.expired`   | reset link no longer works                                                    |
| 429    | `auth.too_many_attempts`                          | login limits; `params.retryAfterSeconds`, also `Retry-After` header           |
| 500    | `internal.error`                                  | unexpected exception (logged)                                                 |

Field codes inside `validation.failed` (constants on `FieldErrors`): `required`, `email.invalid`,
`password.too_short`, `too_long`, `value.invalid` (enum value or date not allowed), `color.invalid`.
Rules: email ≤ 254 chars and `x@y.z`-shaped, stored trimmed and lower-cased; password ≥ 8 code
points and ≤ 72 UTF-8 bytes (bcrypt's limit; longer is refused, not truncated); display name, Child
name and Child field name 1–100 code points after trim; `color` a palette code; `birthday`
`YYYY-MM-DD` or `null`; Child field `position` required.

A new code the user may see needs an entry in the web's `ERROR_KEYS` (see
[`frontend.md`](frontend.md#api-client-and-errors)); unmapped codes show the generic message.

## Security, sessions, CSRF

`family.auth.SecurityConfig` holds the API chain (no matcher, no `@Order`, so it runs after the
`webapp` chain):

- Public: `/actuator/health`, `GET /api/auth/session`, `POST /api/auth/bootstrap`,
  `POST /api/auth/login`, `GET /api/invites/by-token/*`, `POST /api/invites/by-token/*/accept`,
  `GET /api/password-resets/by-token/*`, `POST /api/password-resets/by-token/*/complete`. A new
  public endpoint goes into this list.
- Authenticated: everything else under `/api/**` and `/actuator/**`. Failures return
  `401 auth.required`, never a redirect or HTML. Form login, HTTP Basic, Security's logout and the
  request cache are disabled.
- **CSRF**: `CookieCsrfTokenRepository.withHttpOnlyFalse()` (cookie `XSRF-TOKEN`, path `/`,
  `Secure`, `SameSite=Lax`) with a plain `CsrfTokenRequestAttributeHandler`, so the raw token comes
  back in the `X-XSRF-TOKEN` header on every non-GET request, login and bootstrap included.
  `GET /api/auth/session` loads the deferred token, which writes the cookie.

**Sessions** are server-side in PostgreSQL (Spring Session JDBC; tables `spring_session` and
`spring_session_attributes` from `V1`, `initialize-schema: never`), so they survive redeploys.

- Cookie `SESSION`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age` = `SESSION_TIMEOUT`.
- Sliding expiry: Spring Session renews the session on each request but only writes the cookie when
  the id changes, so `SlidingSessionCookieFilter` (order `SessionRepositoryFilter.DEFAULT_ORDER + 1`)
  re-sends the cookie with a fresh `Max-Age` on every request with a valid session.
- `SessionLogin.logIn(memberId, request, response)` is the only way in (bootstrap, login, Invite
  acceptance, password reset). It changes the session id if a session exists (fixation protection)
  and stores an `AuthenticatedMember` whose `getName()` is the Member id. Spring Session indexes
  that as `principal_name`, so `FindByIndexNameSessionRepository.findByPrincipalName(memberId)`
  finds all of a Member's sessions; `PasswordResetController` deletes them all before logging in
  on the current device.
- Logout invalidates this device's session only. Changing the password in Settings leaves sessions
  alone.

**Passwords**: Spring Security's delegating encoder (bcrypt), bean in
`family.member.PasswordEncoderConfig`. `LoginService.authenticate` checks an unknown email against
a dummy hash so both failure cases take the same time. Emails are matched after
`LoginService.normalizeEmail` (trim, lower-case).

**Bootstrap** (`BootstrapService`) is allowed only while `member` has no rows, checked under
`FamilyLock`, so concurrent requests yield exactly one Member.

**Login limits** (`LoginLimits`): in-memory sliding windows of failed logins per normalized email
and per client IP. Over either limit, login returns `429 auth.too_many_attempts` with
`retryAfterSeconds` before the password is checked. A successful login clears the email's counter,
not the IP's. Counters reset on restart (one app instance, ADR-0004); existing sessions are never
affected.

**Client IP**: `server.forward-headers-strategy: native` plus
`server.tomcat.remoteip.internal-proxies: ${TRUSTED_PROXIES:}`. Compose sets `TRUSTED_PROXIES` to
Caddy's fixed address, so `request.getRemoteAddr()` is the real client IP in production; unset, no
forwarded header is trusted.

## Flyway

Migrations are in `backend/src/main/resources/db/migration`:

| File                            | Creates                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| `V1__family_member_session.sql` | `version_seq`, `bump_version()`, `family` (+ Default row «Семья»), `member`, Spring Session tables |
| `V2__password_reset.sql`        | `password_reset`                                                                                   |
| `V2_1__invite.sql`              | `invite` (numbered 2.1 because V3/V4 were reserved by parallel tickets)                            |
| `V3__child.sql`                 | `child`                                                                                            |
| `V4__child_field.sql`           | `child_field` + Default Child fields «Вес», «Рост» (`TEXT`, positions 1.0, 2.0)                    |

- **Append-only** (S5): never edit a merged migration; add a new one with the next version.
- **Defaults** are inserted by the same migration that creates their table, so they are written
  exactly once per installation and never come back after a Member edits or removes them. Russian
  strings are allowed there (I1, "seed data"). Default rows get Versions from the trigger like any
  write.
- Hibernate only validates the schema (`ddl-auto: validate`); the schema comes from Flyway alone.
- Server-only tables (`family`, `password_reset`, `invite`, Spring Session) have no sync columns
  and may be hard-deleted. `token_hash` columns are `BYTEA` with a 32-byte check.

## Adding a syncable table

Follow `child` (`V3__child.sql`, `family.child`) or `child_field`:

1. Migration: `id UUID PRIMARY KEY` (no default: the client generates it), the domain columns,
   and the sync columns and trigger below. Seed its Defaults in the same migration.

   ```sql
   version    BIGINT NOT NULL,
   updated_at TIMESTAMPTZ NOT NULL,
   deleted    BOOLEAN NOT NULL DEFAULT FALSE

   CREATE TRIGGER <table>_bump_version
     BEFORE INSERT OR UPDATE ON <table>
     FOR EACH ROW EXECUTE FUNCTION bump_version();
   ```

2. Entity: map `version` and `updatedAt` with `@Generated(event = {EventType.INSERT, EventType.UPDATE})`
   and `@Column(insertable = false, updatable = false)`, so Java never writes them and Hibernate
   reads them back. Give it a `markDeleted()`/`delete()` that sets `deleted = true`.
3. Repository: extend `Repository<E, UUID>` (not `JpaRepository`) and declare only what you need:
   `saveAndFlush`, `findById` (including deleted rows, so a `PUT` can tell "deleted" from "new") and
   an ordered list query filtering `deleted = false`. No delete methods (S2).
4. Service: `put(id, request)` validates, takes `FamilyLock.lock()`, then creates or fully replaces;
   a deleted id throws `409 <entity>.deleted`. `delete(id)` marks deleted if present and not yet
   deleted. Both `@Transactional`, both reusable by M2's sync push.
5. Controller: `@ConditionalOnWebApplication`, `PUT /api/<things>/{id}` with `@PathVariable UUID id`,
   `DELETE` returning `204`, `GET` returning the ordered non-deleted list. Responses carry `id`,
   `version`, `updatedAt`.
6. Add the table to the list in [`sync.md`](sync.md) in the same PR (S1).

## Testing

- **HTTP seam (T1)**: `@SpringBootTest @AutoConfigureMockMvc @Import(PostgresTestcontainer.class)`.
  `PostgresTestcontainer` provides PostgreSQL 18 through `@ServiceConnection`; Spring reuses one
  container per test context. Flyway runs as in production. Assertions go through HTTP only; JDBC is
  used for fixture set-up.
- Helpers in `src/test/java/io/github/aborgatin/familyapp/family/`:
  - `Browser`: one device on MockMvc. Keeps cookies, sends `X-XSRF-TOKEN` on writes, and has its own
    client IP (`new Browser(mvc)`; `new Browser(mvc, ip)` to share one; `Browser.newDeviceIp()`).
    Methods: `openApp()` (`GET /api/auth/session`), `get`, `post(path)` (no body), `postJson`,
    `putJson`, `patchJson`, `delete`. Login-limit counters live for the whole cached context, so
    tests that fail logins use unique emails.
  - `FreshInstallation`: `reset(jdbc)` in `@BeforeEach` truncates sessions, `child` and `member`
    (cascading to Invites and resets) but keeps `child_field` Defaults; `removeChildFields(jdbc)`;
    `addMember(jdbc, email, password, name, gender)`.
- **Restart tests**: `HttpDevice` (real port, cookies survive restarts) with
  `HttpDevice.startApp(postgres)` against a test-owned static container; see
  `SessionSurvivesRestartTest` and `ChildFieldDefaultsTest`.
- Other: `ModularityTest` (Modulith verify), `WebBundleServingTest` (RANDOM_PORT +
  `TestRestTemplate`; test bundle in `src/test/resources/static/`), `ForwardedHeadersTest`
  (`TRUSTED_PROXIES=127\.0\.0\.1` + `X-Forwarded-For`), `PasswordResetCommandTest` (runs the command
  entry point against Testcontainers), `HealthEndpointTest`, `ApiErrorsTest`.
- Run with `./gradlew test` (Docker must be running). CI runs `spotlessCheck`,
  `compileJava compileTestJava` and `test`.
