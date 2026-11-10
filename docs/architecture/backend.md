# Backend

What exists in `/backend` after Spec #1 (M0 + M1), the M2 sync core (spec #3, tickets #52 and
#53), live updates (#54), Lists (#55, #56), Items (#57, Done #58) and, from M3 (spec #4),
Categories (#70) and Item history (#74). Vocabulary: [`GLOSSARY.md`](../../GLOSSARY.md).
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

| Module    | Public API (root package)                                                                              | Internal                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `family`  | `Members`, `MemberSummary`, `PasswordResets`, `FamilyLock`, `Family`, `FirstMemberRegistered`, `Children`, `ChildDeleted` | `family.auth`, `family.member`, `family.child`, `family.childfield`    |
| `sync`    | `SyncableTable`, `SyncedRecord`, `Operation`, `Outcome`, `SyncRow`, `SyncLock`, `SyncableWriteStarted` | `sync.internal` (`SyncController`, `SyncService`, `LiveUpdates`, `LiveUpdatesController`) |
| `lists`   | none                                                                                                   | `lists.list`                                                                              |
| `error`   | `ApiException`, `ApiError`, `FieldErrors`                                                              | `error.internal.ApiExceptionHandler`                                                      |
| `command` | `Commands` (called from `FamilyAppApplication.main`)                                                   | `PasswordResetCommand` (package-private)                                                  |
| `webapp`  | none                                                                                                   | `WebBundleConfig`                                                                         |

Dependencies: `family → error`, `family → sync`, `lists → sync`, `lists → error`, `lists → family`,
`sync → error`, `command → family`. (`lists` reaches Members through `Operation.memberId()`, and
`family` for the `FirstMemberRegistered` and `ChildDeleted` events, for `Children` (Child
lists, #90) and for `Members.byId` (an Item's Assignee must be a Member, #85); the spec also
allows `FamilyLock` when a ticket needs it.) The Version
sequence and trigger are database objects from `V1`; `sync` only reads `version_seq` for the push
answer (see [`sync.md`](sync.md)).

Spec #5 asks for one module, `family`. `error`, `command` and `webapp` go beyond that scope on
purpose, because none of them belongs to the Family domain and each is shared or stands apart:

- `error`: the `{code, params}` error shape (I1) and its single MVC mapping. Every module throws
  `ApiException` and `FieldErrors`; keeping them in `family` would make each later module depend on
  `family` just to report an error.
- `command`: operator commands start the application without a web server and call other modules
  through their public API only, as an outside caller would. A separate module lets Modulith check
  that it never reaches into `family`'s internals.
- `webapp`: serving the web bundle (SPA fallback, caching headers, its own public filter chain) is
  infrastructure with no domain code and no dependency on any other module.

### `family`

Owns Family, Member, Invite, Password reset, Child, Child field and Child field value, plus authentication, because
Members are the principals. Sub-packages:

- `family.auth`: everything web and security: `SecurityConfig`, `SessionLogin`,
  `SlidingSessionCookieFilter`, `SessionTransactionConfig`, `PasswordResetCompletion`,
  `LoginLimits`, `ApiErrorWriter`, `AuthenticatedMember` and the
  controllers `AuthController` (`/api/auth`), `InvitesController` (`/api/invites`),
  `MembersController` (`/api/members`), `PasswordResetController` (`/api/password-resets`).
- `family.member`: `Member`, `Invite`, `PasswordReset` entities and repositories; `BootstrapService`,
  `LoginService`, `MemberService`, `InviteService`; `RegistrationRequest` (registration body and the
  shared static checks `checkPassword`, `checkDisplayName`, `checkGrammaticalGender`);
  `OneTimeTokens`; `PasswordEncoderConfig`; `MemberSyncTable` (the `member` table of the pull).
- `family.child`: `Child`, `ChildService` (the `child` `SyncableTable`), `ChildRequest`,
  `ChildColorPalette`. No REST endpoint: Children are written by the push and read by the pull.
  Deleting a Child publishes `ChildDeleted` (below).
- Child field values (#91, ADR-0007) are in `family.childfield` too: `ChildFieldValue` (`child_id`,
  `child_field_id`, `value`, `recorded_at`; no setters, an entry never changes),
  `ChildFieldValueRepository` (`markDeletedOfChild`, `markDeletedOfChildField`: bulk JPQL updates
  that flush and clear the persistence context), `ChildFieldValueRequest` (`validate()`: the two
  ids and the value required, the value trimmed → `Valid`, whose `valueOf(valueType)` checks it by
  the Value type) and `ChildFieldValueService`, the `child_field_value` `SyncableTable`:
  - `apply`: `Outcome.deleteWins`; an upsert of a known entry is `APPLIED` and writes nothing; of
    an unknown one: `validate()`, then the Child (`family.Children.known`) and the Child field must exist
    (`child.not_found` / `child_field.not_found`), a deleted one of either → `IGNORED`, then the
    value by the field's Value type, then the entry is inserted with `recordedAt` from the
    `Clock`. A delete soft-deletes the entry.
  - Cascades: it listens for `ChildDeleted` (a synchronous `@EventListener`, so inside the delete
    operation's savepoint) and soft-deletes the Child's entries; `ChildFieldService`'s delete calls
    `childFieldDeleted(id)` for the field's.
  - `changesSince`: `childId`, `childFieldId`, `value`, `recordedAt`; every Member sees every
    entry. The latest entry is the client's to pick: the highest Version ([`sync.md`](sync.md)).
- `family.childfield`: `ChildField`, `ChildFieldService` (the `child_field` `SyncableTable`),
  `ChildFieldRequest`, `ValueType` (`TEXT`, `DATE`). No REST endpoint: Child fields are written by
  the push and read by the pull.

The public API (root package) is what spec #5 asks for, plus password resets:

- `Members`: `current()` is the Member the request is logged in as (`401 auth.required` when it is
  not, or when that Member has been removed meanwhile); `byId(id)` is an `Optional`, empty for an
  unknown or removed Member. Both return the record `MemberSummary(id, displayName)`, never the
  internal `family.member.Member` entity. `current()` reads Spring Security's context, whose
  principal is named by the Member id; `MembersApiTest` checks it from a stand-in controller of
  another module.
- `PasswordResets` is public so the `command` module can create resets, and so a later
  «Сбросить пароль» action in Settings can reuse it: `createForEmail(email)` (returns the record
  `NewPasswordReset(url, expiresAt)`), `expiresAt(token)`, `complete(token, newPassword)` (returns
  the `MemberSummary`). It does not end sessions; `family.auth.PasswordResetCompletion` calls it
  and ends them in the same transaction.

Controllers inside `family` still take the Member id from
`@AuthenticationPrincipal AuthenticatedMember`, which is internal to `family.auth`.

Shared patterns inside `family`:

- **`FamilyLock`** (public, so `lists` can use it): one method, `lock()` (the `sync.SyncLock`),
  runs `SELECT id FROM family FOR UPDATE`. It needs a surrounding transaction. Code that needs the
  Family's id (a new Member, Child or Child field stores it) reads it from **`Family.id()`**
  (public; no lock). **Every write to a syncable table takes it
  first** (the push, bootstrap, Invite acceptance, `MemberService.updateProfile` and
  `changePassword`, `PasswordResets.complete`), so Versions commit
  in Version order (sync.md "Versions commit in order") and check-then-insert races run one after
  another. Taking it publishes `sync.SyncableWriteStarted`, which is what sends live updates after
  the commit (see `sync` below).
- **`ChildDeleted(childId)`** (public): `ChildService` publishes it inside the push operation that
  deletes a Child, right after the soft delete. Listeners are plain synchronous `@EventListener`s
  that soft-delete what belongs to the Child in the same operation (its Child field values); one
  that throws rejects the delete.
- **`FirstMemberRegistered(memberId)`** (public): `BootstrapService` publishes it after saving the
  first Member, inside the bootstrap transaction (which holds `FamilyLock`); Invite acceptance
  never does. Listeners are plain synchronous `@EventListener`s, so what they write commits or
  rolls back with the Member: `lists.list.ShoppingListDefaults` creates the Default Shopping lists
  (see `lists` below and "Defaults" under Flyway).
- **`Children`** (public): `known(id)` (a Child with this id was ever created, deleted or not)
  and `present(id)` (created and not deleted), for another module's rows that are about a Child.
  `lists` checks a new Child list's `childId` with it. It reads `child` with `JdbcTemplate`, like
  `Family`, so the `family.child` types stay internal.
- **`ChildDeleted(childId)`** (public): `ChildService` publishes it when a delete operation
  soft-deletes a Child, inside that push operation (its savepoint, under `FamilyLock`). Listeners
  are plain synchronous `@EventListener`s that soft-delete what their module keeps about the
  Child: `lists.list.ListService.onChildDeleted` deletes the Child lists (see `lists` below). A
  listener that throws rejects the delete operation.
- **One-time tokens** (`OneTimeTokens`): 32 random bytes, base64url without padding. Only the
  SHA-256 hash is stored (`token_hash BYTEA`). Used by Invites and Password resets.
- **Validation** collects every bad field in a `FieldErrors` and throws once. Body records read
  every field as a nullable `String`, so a missing or unknown enum value becomes a field code, not a
  parse error. Each body record validates itself: `RegistrationRequest.validate()`,
  `ChildFieldRequest.validate()` and `ChildRequest.validate(palette)` (a bean the check needs is
  passed in) return the normalized values or throw. Services call it before taking `FamilyLock`.

### `sync`

The push and the pull ([`sync.md`](sync.md) has the semantics). Public API:

- `SyncableTable`: what a module implements, as a Spring bean, per syncable table: `name()`
  (`child`), `apply(Operation)` → `Outcome.APPLIED` / `IGNORED` (throw an `ApiException` or
  `FieldErrors` to reject; the default rejects with `sync.read_only`, for pull-only tables), and
  `changesSince(version, memberId)` → `List<SyncRow>` (deleted rows as `SyncRow.tombstone`, rows
  the Member may not see as tombstones or left out). `SyncService` collects every bean; two with
  the same name fail start-up.
- `SyncedRecord` (`id()`, `version()`, `deleted()`): implemented by every syncable entity, so the
  two helpers every table uses work on any of them:
  - `Outcome.deleteWins(operation, existing, upsert, delete)`: the `apply` skeleton. A deleted
    record → `IGNORED`; a delete of an unknown one → `IGNORED`; else `delete(record)` or
    `upsert(operation, Optional<record>)` (empty: create it). Checks that come first, such as A1,
    run before it.
  - `SyncRow.changes(records, visible?, (record, fields) -> fields.put(…))`: the `changesSince`
    rows, a tombstone for a deleted record or one `visible` refuses, else the fields in the order
    put.
- `Operation(memberId, id, type, fields)`: `type` `UPSERT` / `DELETE`; `has(field)`,
  `text(field)` and `number(field)` (a value of another JSON type is `validation.failed` /
  `value.invalid`) read the raw JSON fields.
- `SyncLock`: the lock the push takes; `family.FamilyLock` implements it, so `sync` doesn't depend
  on `family`.
- `SyncableWriteStarted`: the event the lock publishes inside every transaction that writes a
  syncable row; `sync` answers it with live updates after the commit.

`sync.internal.SyncService.push` runs in one transaction: `SyncLock.lock()`, then each operation
inside `SAVEPOINT sync_operation` (Hibernate's JPA dialect has no savepoints, so it is plain SQL
through `JdbcTemplate`, which joins the JPA transaction). A rejection rolls back to the savepoint
and clears the persistence context. Hence two rules for `apply`: validate before changing anything
and flush each write (`saveAndFlush`), and don't annotate it `@Transactional` (a participating
transaction that throws marks the whole push rollback-only). `pull` is
`@Transactional(readOnly = true, isolation = REPEATABLE_READ)`. `SyncController` takes the Member
id from the session principal's name (`AuthenticatedMember` is named by the Member id).

Live updates ([`sync.md`](sync.md#live-updates-sse)): `LiveUpdatesController`
(`GET /api/sync/events`, web-only) opens an `SseEmitter` (no timeout) in `LiveUpdates` with a check
of its Spring Session id (`SessionRepository.findById`). `LiveUpdates` (not web-only, so the
`command` context starts without it failing) keeps the open connections:

- `changed` with `SyncService.latestVersion()` on open, and after commit: its listener for
  `SyncableWriteStarted` registers one `TransactionSynchronization.afterCommit` per transaction
  (a marker resource keeps it to one however often the transaction takes the lock).
- A heartbeat thread (`sync.heartbeat`, default `25s`; a code default, only tests change it, so it
  is not an environment variable) sends a comment, or ends a connection whose session is gone.
- A failed write just forgets the connection (Spring MVC ends the request); `ApiExceptionHandler`
  ignores `AsyncRequestNotUsableException` (client gone) instead of logging an error.
- On `ContextClosedEvent` it ends every connection, so graceful shutdown doesn't wait for them.

### `lists`

Lists, Items and Categories: written only by the push, read only by the pull, no REST endpoints
(Item history: written by the server, read by the pull; the push may only delete a row). `lists.list`: `ListEntity` (named so it doesn't shadow `java.util.List`), `ListKind`
(`SHOPPING`, `TODO`, `WISH`) and `Visibility` (`PRIVATE`, `SHARED`), both code (S7);
`ListRepository`; `ListRequest` (merged fields → `validate()`: name 1–100 code points after trim,
the Child name limits; known kind and Visibility; `unnamedCategoryPosition` a finite number, 0 when
a create leaves it out) → `ListDetails`; `ListService`, the `list`
`SyncableTable`:

- `apply`: another Member's Private List (not deleted) → `list.not_found` (A1,
  `ListEntity.notFound(listId)`, the one factory `ItemService` uses too); then `Outcome.deleteWins`; upsert merges the carried fields over the stored ones, validates, then
  `list.kind_immutable` if the kind changed, `list.owner_only` if a Member other than the Owner
  changed the Visibility (the same value is no change), and `list.wish_shared_only` for a Private
  Wish list; a delete by a Member other than the Owner is `list.owner_only` too.
  A create sets the Owner (`operation.memberId()`) and `createdAt`; neither ever changes. A
  Visibility change also gives the List's Items, Categories and Item history a new Version
  (`bumpVersionsInList` on `ItemRepository`, `CategoryRepository` and `ItemHistoryRepository`: a
  no-op UPDATE the trigger stamps), so the pull sends them again with or without their fields. A
  change to `PRIVATE` first removes the Assignee from every Item of the List, Done ones included
  (#85; `ItemRepository.clearAssigneesInList`), in the same operation; a change back to `SHARED`
  restores nothing. A
  delete soft-deletes the List, its Items, its Categories and its Item history (`markDeletedInList`
  on the three). All are bulk
  JPQL updates that flush and clear the persistence context, so later operations of the same push
  see them.
- Child lists (#90; `list.child_id`, nullable, → `child`): a create may carry `childId`
  (`RequestFields.uuid`; a non-UUID is `validation.failed`), stored for good
  (`ListEntity.childId`, `updatable = false`). An upsert of a known List may only repeat the
  stored value, `null` for an ordinary List (`list.child_immutable` otherwise, so a repeated push
  stays applied, S3). With a Child, after the checks above: kind `SHOPPING` →
  `list.child_not_shopping`; Visibility `PRIVATE`, on create or later →
  `list.child_shared_only`; on create, a Child that never existed (`family.Children.known`) →
  `list.child_not_found` (`params.childId`), one deleted meanwhile (`Children.present`) →
  `IGNORED` (delete wins). Owner rules are those of any List. `onChildDeleted`
  (`@EventListener` for `family.ChildDeleted`) soft-deletes the Child's Lists
  (`ListRepository.findByChildIdAndDeletedFalse`) with their Items, Categories and Item history,
  whoever owns them, the same way a List delete does (`deleteWithContent`), inside the push
  operation that deletes the Child.
- `changesSince`: `name`, `kind`, `visibility`, `unnamedCategoryPosition`, `ownerId`, `childId`
  (`null` for an ordinary List), `createdAt`; a tombstone for a deleted List and for another Member's Private List
  (`ListEntity.visibleTo(memberId)`).

`ShoppingListDefaults` listens for `family.FirstMemberRegistered` and creates the Default Shopping
lists with server-made ids: Супермаркет (Shared, Owner the new Member, `unnamedCategoryPosition` 0
so the untitled add field comes first, then Categories «Еда» position 1 and «Бытовая химия» 2) and
Аптека (Shared, `unnamedCategoryPosition` 0).
Afterwards they are ordinary Lists and Categories. Tested by `lists.ShoppingListDefaultsTest`; that
a failing Defaults listener rolls the registration back, by `lists.ShoppingListDefaultsRollbackTest`.

`VisibleLists` (a bean) is A1 for the tables whose rows belong to a List: `find(listId,
memberId)` (the List, deleted or not, or `list.not_found`), `rowsVisibleTo(memberId, rows,
listIdOfRow)` (the pull's `visible` predicate, loading the Lists once with `findAllById`).
Items, Categories and Item history use it. `RequestFields` holds the field checks Lists,
Categories and Items share: `name` (1–100 code points after trim), `position` (required, finite),
`uuid(operation, field)` (absent or `null` is none, else `value.invalid` unless a UUID), and
`listId(operation)` / `sameList(operation, listId)` for the create-only `listId` field.
`ItemService` looks an Item's List up once per operation and passes it on.

Items are in the same package (an Item belongs to its List): `ItemEntity` (`list_id`, `text`,
`category_id`, `description`, `due_date`, `due_time`, `repeat`, `assignee_id`, `done`, `done_by_id`, `done_at`, `creator_id`, `created_at`),
`DueDate` (a record of the day and the optional time of day, `NONE` for no Due date), `Repeat` (enum `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`), `ItemRepository`,
`ItemRequest` (text 1–1000 code points after trim, description ≤ 10000 or blank = none) → `ItemDetails`;
`ItemService`, the `item` `SyncableTable`:

- `apply`: a known Item: deleted → `IGNORED`; its List not visible to the Member →
  `list.not_found`; upsert merges `text` / `description` over the stored ones and validates (`listId`
  naming another List → `validation.failed`), then sets Done when it carries `done`
  (`ItemEntity.markDone`), delete soft-deletes. An unknown Item: delete →
  `IGNORED`; upsert needs `listId` (`required` / `value.invalid`), whose List must exist and be
  visible (`list.not_found`, `params.listId`), deleted List → `IGNORED`; then `text` required. A
  create sets the Creator (`operation.memberId()`) and `createdAt`, and may carry `done`.
- Done (`done`, read with `Operation.bool`: a non-boolean is `value.invalid`, `null` is
  `required`): `ItemEntity.markDone(done, memberId, now)` sets `done_by_id` and `done_at` when it
  turns true and clears them when it turns false; the same value changes nothing, so Hibernate
  writes no UPDATE and the Version stays (S3). `done_by_id` / `done_at` are never written by an
  operation.
- Category (`categoryId`, when carried; `ItemEntity.moveTo`): `null` is the Unnamed category; a
  UUID must name a Category of the Item's own List, which must be `SHOPPING`, else
  `item.category_not_found` (`params.categoryId`); a deleted one is stored as `null`.
- Due date (#84; `dueDate`, `dueTime`, when either is carried; `ItemService.dueDate` →
  `ItemEntity.due(DueDate)`): columns `DATE` and `TIME`, mapped as `LocalDate` / `LocalTime`,
  wall-clock values that never pass through a time zone. The carried fields are merged over the
  stored `DueDate`; a `dueDate` of `null` drops the stored time. Then, in this order:
  `item.list_not_todo` (`params.listId`) unless the List is `TODO`; `validation.failed` /
  `value.invalid` for a day that isn't ISO `YYYY-MM-DD` or a time that isn't strict `HH:mm`;
  `item.due_time_without_due_date` when a time is left without a day. An upsert carrying neither
  field leaves the Due date alone on every kind of List.
- Repeat (#86; `repeat`, when carried; `ItemService.repeat` → `ItemEntity.repeat`): column
  `repeat` (`VARCHAR`, `@Enumerated(STRING)`), one of `Repeat` by its exact name or `null` for
  none, checked against the Due date the same operation leaves. In this order:
  `item.list_not_todo` (`params.listId`) unless the List is `TODO`, even for `null`;
  `validation.failed` / `value.invalid` for any other value (`HOURLY`, `weekly`, `""`, a number);
  `item.repeat_without_due_date` for a Repeat on an Item left without a Due date (none stored, or
  `dueDate: null` in the same upsert). An upsert not carrying the field keeps the Repeat, unless
  it leaves the Item without a Due date: then the Repeat goes too.
- Next occurrence (#87, ADR-0009; `ItemService.change` → `ItemEntity.nextOccurrence`): when a
  change turns Done from false to true and leaves a Repeat, the same operation clears the Done
  Item's Repeat and saves a new open `ItemEntity` (id `UUID.randomUUID()`, the one Item id the
  server makes) with the same List, text, Description, Assignee, Repeat, time of day and Creator,
  created now. Its day is `Repeat.next(oldDay, today)`: one period on (`plusDays` / `plusWeeks` /
  `plusMonths` / `plusYears`, which clamp to the month's last day), repeated from the clamped day
  until after today. Today is `LocalDate.ofInstant(clock.instant(), ZoneId.systemDefault())`: the
  JVM's default zone is the installation's, from the container's `TZ`
  ([`deployment.md`](deployment.md)); no new setting. Done set to its current value is no turn, so
  a second tick adds nothing; a create carrying `done: true` adds no copy. Tested by
  `lists.ItemRepeatCopySyncTest`, with Due dates relative to today in the JVM's zone (the test
  runs in the server's JVM), so no fixed clock is needed: the month-end cases start from a past
  31 January or 29 February, whose next occurrence is the first 28th after today.
- Assignee (#85; `assigneeId`, when carried; `ItemService.assigneeId` → `ItemEntity.assignTo`):
  column `assignee_id` (→ `member`), a Member's id or `null` for nobody. In this order:
  `item.list_not_todo` (`params.listId`) unless the List is `TODO`, even for `null`;
  `validation.failed` / `value.invalid` for a value that isn't a UUID; `null` is then accepted on
  any Todo list (on a Private one it changes nothing, so the Owner's other device removing an
  Assignee while the List is made Private is not rejected); `item.assignee_on_private_list`
  (`params.listId`) for a Member on a `PRIVATE` List; `item.assignee_not_found`
  (`params.assigneeId`) when `family.Members.byId` finds no Member (none, or a removed one). An
  upsert not carrying the field leaves the Assignee alone. Making the List Private removes it
  (`ListService`, above).
- Item history: a create, a changed `text`, and Done → open each call `ItemHistoryService.used(list,
  text, now)` in the same operation (below). A delete never touches the history.
- `changesSince`: `listId`, `text`, `categoryId`, `description`, `dueDate` (`YYYY-MM-DD`),
  `dueTime` (`HH:MM`), `repeat`, `assigneeId`, `done`, `doneById`, `doneAt`, `creatorId`, `createdAt`; a tombstone for a deleted Item and for one whose List the Member may
  not see (`VisibleLists.rowsVisibleTo`).

Categories are in the same package too: `CategoryEntity` (`list_id`, `name`, `position`),
`CategoryRepository` (`markDeletedInList`, `bumpVersionsInList`), `CategoryRequest` (name 1–100
code points after trim, `position` a finite number, both required) → `CategoryDetails`;
`CategoryService`, the `category` `SyncableTable`:

- `apply`: a known Category: deleted → `IGNORED`; its List not visible → `list.not_found`; upsert
  merges `name` / `position` and validates (`listId` naming another List → `validation.failed`);
  delete soft-deletes it and moves its Items, Done ones included, to the Unnamed category in the
  same transaction (`ItemRepository.moveToUnnamedCategory`, a bulk UPDATE, so they get new
  Versions; #72). An unknown one: delete → `IGNORED`; upsert needs `listId`, whose List must
  be visible (`list.not_found`); a deleted List → `IGNORED`; then validation, then
  `category.list_not_shopping` (`params.listId`) unless the List is `SHOPPING`. Any Member who
  sees the List may write.
- `changesSince`: `listId`, `name`, `position`; a tombstone for a deleted Category and for one
  whose List the Member may not see.

Item history is in the same package: `ItemHistoryEntity` (`list_id`, `normalized_name`, `name`,
`last_used_at`; the server makes the id), `ItemHistoryRepository` (`findByListIdAndNormalizedName`,
`markDeletedInList`, `bumpVersionsInList`), `ItemHistoryService`, the `item_history`
`SyncableTable`:

- `apply` (#78): an upsert is `sync.read_only`. A delete: unknown or deleted row → `IGNORED`;
  its List not visible → `list.not_found`; else `ItemHistoryEntity.markDeleted()` (soft delete).
- `used(list, name, at)`: only for a `SHOPPING` List; upserts the row of the List and the name
  trimmed and lower-cased (`ItemHistoryEntity.normalize`), setting the latest spelling and
  `last_used_at`, and reviving a deleted row (`ItemHistoryEntity.used` clears `deleted`): a later
  use beats an earlier delete. Called by `ItemService` inside the push's operation, so it rolls
  back with it. (A List's deleted history is never revived: nothing is written in a deleted List.)
- `changesSince`: `listId`, `name`, `lastUsedAt`; a tombstone for a deleted row and for one whose
  List the Member may not see.

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
- Syncable resources in REST answers (`Member`) always carry `id`, `version`, `updatedAt`. List
  endpoints return non-deleted rows only.
- Syncable tables are written through `POST /api/sync/push` and read by the client through
  `GET /api/sync/pull` ([`sync.md`](sync.md)). Children and Child fields have no REST endpoint any
  more.
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
| `POST /api/sync/push`                                          | `{operations}` → `{results, version}`; see [`sync.md`](sync.md)                    |
| `GET /api/sync/pull?since=N`                                   | `{changes, version}`; see [`sync.md`](sync.md)                                     |
| `GET /api/sync/events`                                         | SSE: `changed` `{version}` on connect and after each syncable commit; heartbeats   |
| `GET /api/password-resets/by-token/{token}` (public)           | `{expiresAt}` or the reset's state error                                           |
| `POST /api/password-resets/by-token/{token}/complete` (public) | `200 Member`; ends all the Member's sessions (same transaction), then logs in      |
| `GET /actuator/health` (public)                                | container healthcheck                                                              |

The pull sends Children in Version order; the web app orders them (`useChildren`: oldest first, no
birthday last, then by name with `Intl.Collator('ru')`, «ё» with «е», then id), checked in
`children.test.tsx`. Child fields likewise: `useChildFields` orders them by `position`, then id
(`childFields.test.tsx`).

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
  from `SecurityConfig`'s entry point (`401 auth.required`) and access-denied handler
  (`403 auth.csrf_invalid`).

### Catalogue

| Status | Code                                              | When                                                                          |
| ------ | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| 400    | `validation.failed`                               | field errors in `params.errors`                                               |
| 400    | `request.invalid`                                 | added: unreadable body, wrong path value type, other 4xx from Spring          |
| 400    | `auth.invalid_credentials`                        | wrong current password in `POST /api/members/me/password`                     |
| 401    | `auth.required`                                   | no session (also a session whose Member no longer exists, in `MemberService`) |
| 401    | `auth.invalid_credentials`                        | login: unknown email or wrong password (same answer)                          |
| 403    | `auth.csrf_invalid`                               | missing or wrong `X-XSRF-TOKEN`                                               |
| 404    | `not_found`                                       | added: no handler for the path                                                |
| 404    | `invite.not_found`                                | unknown Invite id or token                                                    |
| 404    | `password_reset.not_found`                        | unknown reset token                                                           |
| 405    | `method.not_allowed`                              | added: wrong HTTP method                                                      |
| 409    | `auth.bootstrap_closed`                           | bootstrap after the first Member exists                                       |
| 409    | `member.email_taken`                              | Invite acceptance with an email any Member row has (removed ones included)    |
| 410    | `invite.used`, `invite.revoked`, `invite.expired` | Invite link no longer works (checked in that order)                           |
| 410    | `password_reset.used`, `password_reset.expired`   | reset link no longer works                                                    |
| 429    | `auth.too_many_attempts`                          | login limits; `params.retryAfterSeconds`, also `Retry-After` header           |
| 500    | `internal.error`                                  | added: unexpected exception (logged)                                          |

Push results (not HTTP statuses: the push answers `200` with one result per operation) carry the
same `{code, params}`: `validation.failed`, `sync.table_unknown` (`params.table`), `sync.read_only`,
`request.invalid` (no valid id or `op`), and per table `child_field.value_type_immutable` (an
upsert changing an existing Child field's `valueType`) and for Lists `list.not_found`
(`params.listId`; also for an Item or Category of such a List, or in an unknown one),
`list.kind_immutable`, `list.wish_shared_only`, `list.owner_only`, for Child lists
`list.child_not_shopping`, `list.child_shared_only`, `list.child_immutable` and
`list.child_not_found` (`params.childId`), for Categories
`category.list_not_shopping` (`params.listId`), and for Items `item.category_not_found`
(`params.categoryId`), `item.list_not_todo` (`params.listId`: a todo field (a Due date, a Repeat or an Assignee) on an Item of a Shopping
or Wish list; its client message names no field), `item.due_time_without_due_date` (a time of day without a Due date), `item.repeat_without_due_date` (a Repeat without a Due date), `item.assignee_on_private_list` (`params.listId`: an Assignee on an Item of a Private list) and
`item.assignee_not_found` (`params.assigneeId`: an Assignee who is no Member). An operation on a deleted Child, Child field, List,
Item or Category, and creating an Item or Category in a deleted List, is `ignored`, not `409 child.deleted` / `child_field.deleted` any more.
For Child field values: `child.not_found` (`params.childId`) and `child_field.not_found`
(`params.childFieldId`) for an entry naming a Child or Child field that never existed; one naming a
deleted Child or Child field is `ignored`.

Rows marked "added" are not in spec #5's error catalogue. They cover failures Spring raises before
or outside an endpoint's own checks (a body that isn't JSON, an unknown path, a wrong method, an
unexpected exception), so that every error still has the `{code, params}` shape. A 403 is always
`auth.csrf_invalid`: no rule checks roles, so `SecurityConfig`'s access-denied handler has no other
case.

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
  finds all of a Member's sessions. `PasswordResetCompletion` sets the new password, uses up the
  link and deletes them all in one transaction, so a failure changes nothing; then
  `PasswordResetController` logs in on the current device. For that, Spring Session's JDBC writes
  join a surrounding transaction (`SessionTransactionConfig` defines
  `springSessionTransactionOperations` with `PROPAGATION_REQUIRED`; Spring Session's default is
  `REQUIRES_NEW`). Writes made outside a transaction, as in the session filter, still get their own.
- Logout invalidates this device's session only. Changing the password in Settings leaves sessions
  alone.

**Passwords**: Spring Security's delegating encoder (bcrypt), bean in
`family.member.PasswordEncoderConfig`. `LoginService.authenticate` checks an unknown email against
a dummy hash so both failure cases take the same time. Emails are matched after
`LoginService.normalizeEmail` (trim, lower-case).

**Bootstrap** (`BootstrapService`) is allowed only while `member` has no rows, checked under
`FamilyLock`, so concurrent requests yield exactly one Member.

**Invite acceptance** (`InviteService.accept`) creates the Member and marks the Invite accepted in
one transaction under `FamilyLock`. `InvitesController` then logs the new Member in with
`SessionLogin`, so the session is saved after that transaction has committed, the way login and
bootstrap do it. This is a known deviation from all-or-nothing: if saving the session fails, the
Member and the used Invite stay, and the new Member logs in with their email and password instead
of being logged in automatically. It is left as is because nothing is lost: the account exists and
works, unlike a password reset, where a half-done change would leave old sessions alive (see
`PasswordResetCompletion` above).

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
| `V5__list.sql`                  | `list` (Owner → `member`)                                                                          |
| `V6__item.sql`                  | `item` (→ `list`; Creator and done by → `member`), index on `list_id`                              |
| `V7__item_description.sql`      | renames `item.note` to `description` (the glossary's Description)                                  |
| `V8__category.sql`              | `category` (→ `list`), index on `list_id`; `list.unnamed_category_position`; `item.category_id`    |
| `V9__item_history.sql`          | `item_history` (→ `list`), unique on (`list_id`, `normalized_name`)                                |
| `V10__list_child.sql`           | `list.child_id` (→ `child`, nullable: a Child list), partial index on it                           |
| `V11__child_field_value.sql`    | `child_field_value` (→ `child`, `child_field`), indexes on `child_id` and `child_field_id`         |
| `V12__item_due_date.sql`        | `item.due_date` (`DATE`), `item.due_time` (`TIME`): a todo item's Due date, nullable, no backfill  |
| `V13__item_assignee.sql`        | `item.assignee_id` (→ `member`): a todo item's Assignee, nullable, no backfill                     |
| `V14__item_repeat.sql`          | `item.repeat` (`VARCHAR(16)`): a todo item's Repeat, nullable, no backfill                         |

- **Append-only** (S5): never edit a migration merged to `main`; add a new one with a version higher
  than the highest on `main`. `scripts/check-migrations.sh` (CI job `migrations`, also part of
  `scripts/check.sh`) fails on a changed, deleted or renamed merged migration and on a new version
  that is not higher; its self-test is `scripts/check-migrations-test.sh`.
- **Defaults** are inserted by the same migration that creates their table, so they are written
  exactly once per installation and never come back after a Member edits or removes them. The
  exception is the Default Shopping lists: a List needs an Owner, so they come from the first
  Member's registration (`family.FirstMemberRegistered` → `lists.list.ShoppingListDefaults`), not
  a migration, which is just as once-only; installations from before them get no backfill. Russian
  strings are allowed there (I1, "seed data"). Default rows get Versions from the trigger like any
  write.
- Hibernate only validates the schema (`ddl-auto: validate`); the schema comes from Flyway alone.
- Server-only tables (`family`, `password_reset`, `invite`, Spring Session) have no sync columns
  and may be hard-deleted. `token_hash` columns are `BYTEA` with a 32-byte check.

## Adding a syncable table

Follow `child` (`V3__child.sql`, `family.child.ChildService`):

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
   reads them back. Give it a `markDeleted()` that sets `deleted = true`.
3. Repository: extend `Repository<E, UUID>` (not `JpaRepository`) and declare only what you need:
   `saveAndFlush`, `findById` (including deleted rows, so an operation can tell "deleted" from
   "new") and `findByVersionGreaterThan(long)` for the pull. No delete methods (S2).
4. Push: implement `sync.SyncableTable` in the owning module (a bean, not `@Transactional`):
   - `name()`: the table name the client uses;
   - `apply(operation)`: `return Outcome.deleteWins(operation, repository.findById(id),
     this::upsert, this::delete)` (the entity implements `sync.SyncedRecord`). It answers
     `IGNORED` for a deleted row and for deleting an unknown one (delete wins). `delete(entity)`:
     `markDeleted()`, `saveAndFlush` → `APPLIED`. `upsert(operation, existing)`: merge the carried
     fields (`operation.has/text`) over the stored ones, validate everything (unknown id: every
     required field must be there), throw `FieldErrors`/`ApiException` to reject, then create or
     change and `saveAndFlush` → `APPLIED`. Server-set fields (Owner, Creator…) come from
     `operation.memberId()`, never from `fields`; times from a `Clock` field
     (`Clock.systemUTC()`; `ClockTest` fails on a bare `Instant.now()` and the like). The push
     already holds `FamilyLock`; the Family id is `Family.id()`.
5. Pull: `changesSince(version, memberId)`: `SyncRow.changes(repository.findByVersionGreaterThan(version),
   visible, (row, fields) -> …)` putting what the client stores (no secrets; nullable values
   allowed); it sends a tombstone for deleted rows and for rows `visible` refuses for this Member
   (A1; leave `visible` out when every Member sees every row).
6. No REST write endpoint. A REST read endpoint only if something other than the client's local
   store needs it.
7. Any other code path writing the table takes `FamilyLock` first.
8. Add the table to the list in [`sync.md`](sync.md) in the same PR (S1), and on the client to
   `SYNCED_TABLES` with a new Dexie version ([`frontend.md`](frontend.md#local-store-and-sync)).
9. Tests through HTTP with two `Browser`s and the helpers in `SyncRequests` (`push`, `upsert`, `delete`,
   `pull`, `change`, `fields`, `version`), as `ChildrenSyncTest`, `ChildFieldValuesSyncTest`, `lists.ListsSyncTest`, `lists.ChildListsSyncTest`, `lists.ItemsSyncTest`, `lists.CategoriesSyncTest`, `lists.ItemHistorySyncTest`, `lists.ItemDueDateSyncTest`, `lists.ItemRepeatSyncTest`, `lists.ItemRepeatCopySyncTest` and `lists.ItemAssigneeSyncTest` do.

## Testing

- **Time**: main code reads time from a `Clock` field (`private final Clock clock =
  Clock.systemUTC()`), never a bare `Instant.now()`, `LocalDate.now()` and the like. `ClockTest`
  (ArchUnit) enforces it.
- **HTTP seam (T1)**: `@SpringBootTest @AutoConfigureMockMvc @Import(PostgresTestcontainer.class)`.
  `PostgresTestcontainer` provides PostgreSQL 18 through `@ServiceConnection`; Spring reuses one
  container per test context. Flyway runs as in production. Assertions go through HTTP only; JDBC is
  used for fixture set-up.
- Shared helpers, public, in the root test package `src/test/java/io/github/aborgatin/familyapp/`
  (every module's tests import them):
  - `Browser`: one device on MockMvc. Keeps cookies, sends `X-XSRF-TOKEN` on writes, and has its own
    client IP (`new Browser(mvc)`; `new Browser(mvc, ip)` to share one; `Browser.newDeviceIp()`).
    Methods: `openApp()` (`GET /api/auth/session`), `get`, `post(path)` (no body), `postJson`,
    `putJson`, `patchJson`, `delete`. Login-limit counters live for the whole cached context, so
    tests that fail logins use unique emails.
  - `FreshInstallation`: `reset(jdbc)` in `@BeforeEach` truncates sessions, `child` and `member`
    (both cascading: Invites, resets, Lists, Items, Categories, Item history and Child field values) but keeps `child_field` Defaults; `removeChildFields(jdbc)` (with their values);
    `addMember(jdbc, email, password, name, gender)`.
  - `SyncRequests`: `upsert(table, id, fieldsJson)`, `delete(table, id)`, `push(device, ops…)`,
    `pull(device, since)`, `change(device, since, table, id)` (the pulled change or `null`),
    `fields(device, table, id)` (as a first pull returns them), `version(result)`, and the two
    devices most sync tests start from: `bootstrapAnna(mvc)`, `loginBoris(mvc, jdbc)`.
- Concurrency (`PullNeverSkipsASlowerWriteTest`, `MemberWritesTakeTheFamilyLockTest`): a raw JDBC
  connection holds a row lock, a request runs on another thread, and the test waits until it is
  blocked (`LockWaits.transactionsWaitingOnALock(jdbc)` reads `pg_stat_activity`,
  `wait_event_type = 'Lock'`; `LockWaits.waitUntil`). **The one exception to "through HTTP only"
  (T1)**: no HTTP answer can tell a request blocked on the Family lock from a slow one, so the
  ordering guarantee is proven by watching the database. Use `LockWaits` for any new such test.
- **Restart tests**: `HttpDevice` (real port, cookies survive restarts) with
  `HttpDevice.startApp(postgres)` against a test-owned static container; see
  `SessionSurvivesRestartTest` and `ChildFieldDefaultsTest`.
- **Real-port tests**: `HttpDevice` (public) also works in a `RANDOM_PORT` `@SpringBootTest` via
  `new HttpDevice().at(context)`; `openLines(path)` streams a long response line
  by line. `sync.LiveUpdatesTest` reads `/api/sync/events` that way (heartbeat set to `200ms`).
- Other: `ModularityTest` (Modulith verify), `WebBundleServingTest` (RANDOM_PORT +
  `TestRestTemplate`; test bundle in `src/test/resources/static/`), `ForwardedHeadersTest`
  (`TRUSTED_PROXIES=127\.0\.0\.1` + `X-Forwarded-For`), `PasswordResetCommandTest` (runs the command
  entry point against Testcontainers), `HealthEndpointTest`, `ApiErrorsTest`.
- Run with `./gradlew test` (Docker must be running). CI runs `spotlessCheck`,
  `compileJava compileTestJava` and `test`.
- `scripts/check.sh` runs everything from any directory: the migration guard,
  `./gradlew spotlessApply build`, and all web checks (`--image` adds the image build and smoke test).
- Inspect the local dev database (`deploy/docker-compose.dev.yml`) with `scripts/db.sh "<sql>"`;
  `-c <container>` targets another PostgreSQL container, e.g. a Testcontainers one from `docker ps`.
