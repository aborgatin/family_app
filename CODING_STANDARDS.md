# Coding Standards

Read by the `/code-review` agent. Apply **every rule** below to every changed file in the diff;
cite the rule ID (e.g. `B2`) in each finding. A rule with no violation needs no mention.

Stack and decisions: [`docs/PLAN.md`](docs/PLAN.md), [`docs/adr/`](docs/adr/). Vocabulary: [`GLOSSARY.md`](GLOSSARY.md).
UI look and component rules: [`docs/design.md`](docs/design.md).

## Baseline

These community guides are the default for anything this file does not cover. Flag a departure only
when it hurts readability or correctness; style nits the tooling below accepts are not findings.

- Java: [Google Java Style Guide](https://google.github.io/styleguide/javaguide.html)
- TypeScript: [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- React: [Rules of React](https://react.dev/reference/rules)
- Frontend structure: [Bulletproof React](https://github.com/alan2207/bulletproof-react) (feature folders)

## Enforced by tooling

M0 sets these up; CI runs all of them and fails the build on any violation. A review trusts a green
CI for everything they check and spends its attention on the judgement rules further down. If the
diff disables, weakens or bypasses one of them (config change, suppression comment, `@SuppressWarnings`,
`eslint-disable`, `// @ts-expect-error`), that **is** a finding unless the line carries a reason.

| Tool | Scope | Covers |
|---|---|---|
| Spotless + google-java-format | `/backend` | Java formatting, import order |
| Error Prone | `/backend` | common Java bug patterns at compile time |
| Spring Modulith `ApplicationModules.verify()` test | `/backend` | module cycles, access to another module's internal packages |
| `tsconfig` `strict: true` | `/web` | null safety, implicit `any` |
| typescript-eslint `strict-type-checked` | `/web` | unsafe `any`, floating promises, unnecessary conditions |
| eslint-plugin-react-hooks | `/web` | Rules of Hooks, exhaustive effect deps |
| Prettier | `/web` | TS/TSX/CSS/JSON/Markdown formatting |
| eslint-plugin-i18next `no-literal-string` | `/web` | literal text in JSX and user-visible attributes (I2) |
| i18next typed resources | `/web` | unknown i18n keys are type errors (I2) |
| ESLint `no-restricted-imports` (per-folder rules) | `/web` | imports into another feature only via its `index.ts`; `shared → features → app` direction (M3) |
| ESLint `no-restricted-syntax` (`u1/features-only-shared-ui`) | `/web/src/features` | raw `button`/`input`/`select`/`textarea`/`form`/`a` elements and `className`/`style` props (U1) |
| ESLint `no-restricted-imports` (feature blocks) | `/web/src/features` | `@dnd-kit/*`, `lucide-react`, `@radix-ui/*` outside `shared/ui` (U1) |
| `scripts/check-migrations.sh` | Flyway migrations | changed/deleted migrations merged to `main`, new versions not above `main`'s highest (S5) |

## Modules and boundaries

**M1 — One backend module per feature.** Each feature (`family`, `lists`, `notifications`, later
`links`, `recipes`, `trips`) is a top-level package under the application package, which Spring
Modulith treats as a module. The module's root package holds its public API (services, events, DTOs
other modules may use); everything else lives in sub-packages and is internal. New code goes into
the module that owns the concept, not into a shared `util`/`common` dumping ground.

**M2 — Modules talk through public API or events.** Another module's repository, entity or internal
service is off limits even when the Modulith test would not catch it (e.g. reaching it by a shared
table in SQL). Cross-module side effects such as "item added → notify" go through Spring application
events published by the owning module.

**M3 — One frontend feature folder per feature.** `web/src/features/<feature>/` holds that feature's
components, hooks, API calls and local-store access, and exposes what others may use via its
`index.ts`. Imports from another feature go through that `index.ts` only. Dependency direction is
`shared (components, lib, i18n) → features → app (routes, providers)`; a feature never imports from
`app`, and `shared` imports from neither.

## API and i18n

**I1 — The API returns codes, never human text.** Errors, validation messages, notification payloads
and enum-like values travel as stable machine codes plus parameters, e.g.
`{"code": "list.not_found", "params": {"listId": "…"}}`. Any Russian (or any natural-language) string
in backend code outside log messages and seed data is a finding. Push notification text is rendered
from a code + params via the same message files.

**I2 — Every UI string comes from the i18n files.** All user-visible text in `/web` (labels,
placeholders, `aria-label`, `title`, toasts, empty states) goes through the i18n function with a key
in the `ru` resource file. A literal string in JSX or in a user-visible prop is a finding. Plurals and
gendered verbs («добавил/добавила») use the i18n library's plural/context features, not string
concatenation.

**I3 — Error codes are mapped, not echoed.** The client maps each API error code to an i18n key; an
unknown code falls back to a generic message key. Displaying `error.code` or a server message raw is a
finding.

## UI (ADR-0008)

**U1 — Screens are built only from `shared/ui`.** Code in `web/src/features/**` composes the
components of `web/src/shared/ui` ([ADR-0008](docs/adr/0008-ios-style-ui-kit.md),
[`docs/design.md`](docs/design.md)): no raw `button`, `input`, `select`, `textarea`, `form` or `a`
elements, no `className` or `style` props, and no UI library (`@dnd-kit/*`, `lucide-react`,
`@radix-ui/*`) imported directly. A look the kit doesn't have yet is added to `shared/ui` first,
as a component or a prop, with its section in `docs/design.md`. Tests are exempt. Lint checks the
listed elements and props; other ways around the kit (an inline SVG, `dangerouslySetInnerHTML`,
a raw element styled from a stylesheet) are findings too.

## Sync and data (ADR-0003, ADR-0004, ADR-0005)

**S1 — Every syncable table has `id UUID`, `version`, `updated_at`, `deleted`.** "Syncable" means
any table whose rows the client stores locally and keeps up to date through sync: lists, items,
categories, members, children, child fields, and every future module's equivalent. The authoritative
list lives in `docs/architecture/sync.md`; a new syncable table is added there in the same PR.
Server-only tables are not syncable even if the client sees their rows through a REST call: invites,
sessions, push subscriptions. A new Flyway migration creating such a table without all four columns is
a finding.

**S2 — Every write bumps `version`; deletes are soft.** Any code path that changes a syncable row
sets a new version from the global monotonic sequence and updates `updated_at`. Removing a row means
`deleted = true`; an SQL `DELETE` or `repository.delete…` on a syncable table is a finding (purging
old soft-deleted rows in a dedicated, documented job is the only exception).

**S3 — Sync operations are idempotent.** IDs are generated on the client; applying the same outbox
operation twice must leave the same state. Server code that generates IDs for client-created rows,
or that would double-apply on retry (e.g. increments, appends), is a finding.

**S4 — Client mutations go through the outbox.** UI code writes to the local Dexie store and enqueues
an outbox operation; it never calls a mutating REST endpoint directly. Reads render from the local
store, refreshed by the sync pull (triggered by SSE).
_Exception_: auth, Invites and Member account changes (bootstrap, login, logout, creating/revoking/accepting
an Invite, display name, password) call their REST endpoints directly and are online-only by design,
because they need the server's answer immediately. Before M2 ships the outbox, Children and Child fields
also call REST directly (Spec #1); M2 moves them onto the outbox.

**S5 — Migrations are append-only.** A change to a Flyway migration file already merged to `main` is a
finding; the fix is a new migration. A migration that exists only on an unmerged branch (e.g. an
integration branch) may still be fixed in place. `scripts/check-migrations.sh` enforces this in CI.

**S6 — One family, no tenancy.** Code assumes exactly one `Family` row (ADR-0004). Tenant-scoping
logic (`familyId` filters, per-family caches, multi-tenant config) is unneeded complexity.

**S7 — Family-specific data is data, not code** (ADR-0005). List names, categories, child fields and
other per-family values come from the database (seeded on first start), never from constants or
enums. List kinds, visibility values and repeat rules are code.

## Security

**A1 — The server enforces Visibility.** Every endpoint and sync pull that returns or changes a List
or Item checks that a Private list is accessed only by its Owner. Hiding it in the UI is not
enforcement. Missing check = finding, even if no current screen exposes the path.

**A2 — No secrets in git.** Credentials, VAPID keys and tokens come from environment/`.env`;
`.env.example` holds placeholders only.

## Tests

**T1 — Tests hit the public seam.** Backend behaviour is tested through the HTTP API (MockMvc or a
real port) against PostgreSQL via Testcontainers, not H2. Frontend components are tested by
rendering and interacting as a user would (Testing Library queries by role/label text), asserting on
what the user sees. Tests that call private methods, assert on internal state, or mock the module
under test are findings.

**T2 — Changed behaviour has a test.** A behaviour change or bug fix without a test that would fail
without it is a finding. Pure refactors and config changes are exempt.

## Naming

**N1 — Use GLOSSARY.md terms.** Class, table, column, endpoint, variable, i18n key and test names use
the canonical English term (`Member`, `Child`, `Item`, `Done`, `Creator`, `Owner`, `Assignee`,
`Repeat`, `ShoppingList`…). A term from a glossary entry's _Avoid_ line (`User`, `Task`, `StoreType`,
`completed`, `recurrence`, `author`…) is a finding. A new domain concept with no glossary entry is a
finding asking for a GLOSSARY.md update in the same PR.
