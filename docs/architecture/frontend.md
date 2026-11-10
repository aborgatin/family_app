# Frontend

What exists in `/web` after Spec #1 (M0 + M1), the M1.5 UI foundation (spec #35) and M2 so far
(spec #3: the sync core #52, Lists #55, #56, Items #57, Done #58). Rules:
[`CODING_STANDARDS.md`](../../CODING_STANDARDS.md) (M3, I2, I3, S4, T1, U1). Look, tokens and
component rules: [`design.md`](../design.md). Backend contract: [`backend.md`](backend.md).

## Stack

React 19, TypeScript 6 (`strict`, `noUncheckedIndexedAccess`), Vite 8, `vite-plugin-pwa` 2
(Workbox), React Router 8 (import from `react-router`), i18next 27 + react-i18next, Tailwind CSS 4
(`@tailwindcss/vite`), Radix primitives (`@radix-ui/react-popover`, `-dialog`, `-context-menu`, only inside
`shared/ui`),
`lucide-react` (only inside `shared/ui/Icon.tsx`), Vitest 5 + Testing
Library + MSW 3 + `fake-indexeddb`, Dexie 4 (local store), ESLint 10 flat config, Prettier 3.
Node 22 or newer.

Scripts (`web/package.json`): `dev`, `build` (does not typecheck), `typecheck` (`tsc --noEmit`),
`lint` (`--max-warnings 0`), `format` / `format:check`, `test` (`vitest run`). CI job `web` runs
`npm ci`, `format:check`, `lint`, `typecheck`, `test`, `build`. `scripts/check.sh` runs the same
(plus the backend build) from any directory and finds Node 22 by itself, including Homebrew's keg-only
`node@22` in `/opt/homebrew/opt/node@22/bin`.

Local development: start PostgreSQL with `docker compose -f deploy/docker-compose.dev.yml up -d`,
run the backend (see the header of that file), then `npm run dev`. Vite proxies `/api` to
`BACKEND_URL` (default `http://localhost:8080`). Query that database with `scripts/db.sh "<sql>"`.

## Folders and import rules

```
web/src/
  main.tsx              createBrowserRouter(routes) inside <AppProviders>; imports shared/ui/theme.css
  app/                  routes.tsx, AppProviders.tsx (I18nextProvider), SaveRejectedToast
  features/
    auth/               session, guard, setup (bootstrap), login, LogoutSection + useLogout, Invite acceptance,
                        password reset; LinkScreen (link-check states); GrammaticalGender (type)
                        and GrammaticalGenderRow («Пол», also used by «Ваш профиль»)
    home/               HomePage: Page «Семья» with «Дети» (tiles), then «Списки», gear → Settings; HOME_PATH
    lists/              ListsSection («Списки» on Home and on the Child page), NewListSheet, ListPage,
                        ListSettingsPage, useListHome (back to Home, or to the Child page),
                        CategoriesPage («Категории» of a Shopping list), ItemPage (the Item screen),
                        DoneEarlierPage («Выполненные ранее» of a Todo list),
                        listPaths (LIST_PATH, LIST_SETTINGS_PATH, LIST_CATEGORIES_PATH,
                        LIST_ITEM_PATH, LIST_DONE_EARLIER_PATH),
                        ListMissing (gone / loading),
                        ItemsSection (the List screen's Items, by Category on a Shopping list),
                        listTypes (kinds, Visibility, kind texts, Item, Category,
                        ItemHistoryName), useLists(), useItems(list), useCategories(list),
                        useItemHistory(list), itemKeys (normalizedName, sortableTime, compare:
                        shared by useItems and useItemHistory), dueDates (how a Due date reads
                        and when it is overdue)
    settings/           SettingsPage (one grouped page), AppearanceSection (theme), SETTINGS_PATH
    members/            MembersSettings: «Взрослые», InvitesSettings, ProfileSection; PasswordPage;
                        useFamilyMembers() (the Members on the local store, by id)
    children/           ChildrenSettings («Дети»), ChildSettingsPage, NewChildSheet, ChildRows, age, useChildren(),
                        ChildrenTiles («Дети» on Home), ChildPage (the Child page, CHILD_PATH)
    child-fields/       ChildFieldsSettings («Поля профиля»), NewChildFieldSheet, useChildFields(),
                        ChildProfileSection («Профиль» on the Child page), useChildFieldValues(childId)
  shared/
    api/                API client, error-code mapping, form error helpers
    i18n/               i18next set-up, typed keys, locales/ru.json
    load/               useLoad(): load / failed / retry for anything fetched once
    sync/               local store (Dexie), sync engine, useRows / useSyncedRows / upsertRow /
                        deleteRow, useSaveRejection, startSync / stopSync / onSessionEnded
    palette/            Child color palette (childColors.json)
    ui/                 the only place that draws (U1; docs/design.md): theme.css (tokens),
                        AppShell, Page (nav bar), CenteredPage, StatusScreen, Button, Link, Icon
                        (lucide), EmptyState, OfflineIndicator, Form, Sections, GroupedSection,
                        InputRow, TextAreaRow (+ LinkedText, not exported), DateRow,
                        SegmentedControl, SelectRow, ColorChoice, Swatch, ListRow,
                        LoadingRow, EditableRow, AddRow (+ SuggestionRows, not exported), SortableList (dnd-kit), SwipeToDelete,
                        RowContextMenu, Avatar, ActionSheet, ConfirmRow, Sheet (Radix), Spinner, Toast,
                        TileGrid + Tile,
                        auto-save hooks (autoSave.ts), useFooterLines(), useEditableList()
  test/                 renderApp, MSW server, fake sync server, EventSource stub, fixtures, setup
```

- Each feature's public surface is its `index.ts`. Other code imports a feature only as
  `@/features/<name>`, never `@/features/<name>/<file>`.
- Direction is `shared → features → app`: `shared` imports neither features nor `app`; a feature
  never imports `app`.
- Leaving your own folder (a layer, or one feature) uses the `@/` alias (`@/shared/...`,
  `@/features/<name>`, `@/app/...`). A relative `../` may not climb out of it.
- All of this is enforced by `no-restricted-imports` blocks generated per file depth in
  `web/eslint.config.js` (`layerBlocks`). Tests and `src/test/**` are exempt.
- Screens are built only from `shared/ui` (CODING_STANDARDS U1, ADR-0008). The UI libraries
  (`@dnd-kit/*`, `lucide-react`, `@radix-ui/*`) are imported only in `shared/ui`; the same blocks
  forbid them in `features/**`. A separate block, `u1/features-only-shared-ui`
  (`no-restricted-syntax`, `src/features/**/*.{ts,tsx}`, tests exempt), forbids raw `button`, `input`,
  `select`, `textarea`, `form`, `a` elements and `className` / `style` props there. A look the kit
  lacks is added to `shared/ui` first, with its section in `design.md`.
- A feature keeps its components, hooks and API calls together; `*Api.ts` files hold the REST
  calls. Synced data goes through the feature's hook only ("Data access"); online-only screens
  (auth, Invites, Member account changes, S4) may call their own feature's `*Api.ts` directly.

## Routing and the auth guard

`web/src/app/routes.tsx`: every route is a child of the layout route `AuthGuard`
(`features/auth/AuthGuard.tsx`), which sits inside the layout route `AppShell` (`@/shared/ui`), the
frame around every screen and the place a sidebar goes later.

| Path                     | Screen              | Reachable                      |
| ------------------------ | ------------------- | ------------------------------ |
| `/setup`                 | `SetupPage`         | only while `bootstrapRequired` |
| `/login`                 | `LoginPage`         | logged out                     |
| `/invite/:token`         | `InvitePage`        | always (public)                |
| `/reset-password/:token` | `ResetPasswordPage` | always (public)                |
| `/`                      | `HomePage`          | logged in                      |
| `/lists/:id`             | `ListPage`          | logged in                      |
| `/lists/:id/settings`    | `ListSettingsPage`  | logged in                      |
| `/lists/:id/categories`  | `CategoriesPage`    | logged in                      |
| `/lists/:id/items/:itemId` | `ItemPage`        | logged in                      |
| `/lists/:id/done-earlier` | `DoneEarlierPage`  | logged in                      |
| `/settings`              | `SettingsPage`      | logged in                      |
| `/settings/password`     | `PasswordPage`      | logged in                      |
| `/settings/children/:id` | `ChildSettingsPage` | logged in                      |
| `/children/:id`          | `ChildPage`         | logged in                      |

The guard calls `GET /api/auth/session` once at start (and again only on «retry» after a failure,
or after an offline cold start, below;
meanwhile a `StatusScreen` shows «Загрузка…», or the failure with «Повторить»), then:

1. `bootstrapRequired` and not on `/setup` → `/setup`. Not required and on `/setup` → `/`.
2. No Member, not on `/login`, path not public (`isPublic()`: `/reset-password/…`, `/invite/…`) →
   `/login` with `state.from` = path + search + hash.
3. Member present and on `/login` → back to `state.from` (only same-app paths, never `/login`
   itself), else `/`.

**Offline cold start** (`sessionAtStart`): when the session request fails because the server
can't be reached (`network.unavailable`), there is no pending logout and the local store has an
owner, the guard starts as that Member from the copy kept on the device (`ownerCopy()`, saved by
`saveOwnerCopy(member)` whenever the server confirms the session or the Member changes; it is
wiped with the store) instead of showing the start-up error. Screens work from the local store,
writes go to the Outbox, and the offline indicator shows as usual. Such a session is marked
`fromDevice`: the engine does not start, and the guard asks for the session again on the browser's
`online` event, any API answer, the foreground, and with backoff (1 s doubling to 30 s) until the
server answers. The answer replaces the session and the rules above apply: the same Member starts
the engine (the answer has issued the CSRF cookie before any push), no Member → `/login` with the
store and Outbox kept for the same Member, `bootstrapRequired` → `/setup`. The device copy carries
the session's Member (with email) because the pulled `member` rows carry only id, display name and
Grammatical gender. With a pending logout or an ownerless store the start-up error shows as before.

It provides `SessionContext`; screens read it with `useSession()` (`@/features/auth`):
`session` (`{bootstrapRequired, member}`), `loggedIn(member)`, `memberChanged(member)`,
`loggedOut()`. Screens report what happened and let the guard redirect: `LoginPage` calls
`loggedIn()` and does not navigate itself. `ResetPasswordPage` and `InvitePage` navigate to `/`
after `loggedIn()`. `/setup` and `/invite/:token` share `RegistrationForm`.

**Pending logout** (`features/auth/logoutApi.ts`): logging out while the server can't be reached
logs the device out at once and sets a flag in `localStorage` (`family-app.logout-pending`).
While it is set the guard treats the session as having no Member, whatever the server answers (the
cookie may still be valid there), so sync never starts. The guard sends `POST /api/auth/logout`
at start, whenever the server becomes reachable and on the browser's `online` event, and clears
the flag on `204` or `auth.required`. Every way of logging in (`authApi.ts`: bootstrap, login,
Invite, password reset) goes through `loggingIn()`: it sends a pending logout first, holds it off
while the login request is under way (the login's answer makes the server reachable, which would
otherwise send it with the new session's cookie), and clears the flag once logged in.

The four auth screens are `CenteredPage`s (app icon, large title, no nav bar): one
`GroupedSection` of `InputRow`s (registration adds «Пол» as a `SegmentedControl`) inside a
`Form`, field and form errors in the group footer, and the full-width primary `Button`. The
Invite and reset screens go through `LinkScreen`, which shows the link check
(«Проверяем ссылку…»), a broken link («Ко входу») or an unreachable server («Повторить») as an
`EmptyState` in the same layout, and the form once the link works.

A new public screen needs a branch in `isPublic()`. Server deep links work because the backend
returns `index.html` for any non-API path ([`backend.md`](backend.md#webapp)).

## API client and errors

`@/shared/api` (`web/src/shared/api/`):

- `api.get/post/put/patch/delete<T>(path, body?)`: `fetch` with `credentials: 'same-origin'`, JSON
  in and out, `204` → `undefined`. Every non-GET sends the `XSRF-TOKEN` cookie's value as
  `X-XSRF-TOKEN`.
- Every failure rejects with `ApiError` (`status`, `code`, `params`, `fieldErrors`).
  `asApiError(error)` turns whatever a `catch` got into an `ApiError` (`unknown`, status 0, when it
  isn't one already); use it instead of writing the check again. A fetch that
  throws (offline, server unreachable) becomes `ApiError(0, 'network.unavailable')`
  (`NETWORK_UNAVAILABLE`). A non-JSON error body becomes code `unknown`.
- Every request reports whether it reached the server (`serverReachable.ts`): one that throws
  marks the server unreachable, the next one that gets any HTTP answer (even an error status)
  marks it reachable. `useServerReachable()` reads that; the offline indicator is its only user.
  `navigator.onLine` is not used (unreliable on iOS, and says nothing about our server).
- `errorMessageKey(code)` maps an API code to an i18n key through `ERROR_KEYS` in
  `errorMessages.ts`; anything unmapped → `errors.generic` (I3). Add a line there for every new
  code the user may see. Never render `error.code`.
- `errorMessage(apiError)` returns `{key, values}` for `t(key, values)`; it fills params, e.g.
  minutes to wait for `auth.too_many_attempts` (plural keys `_one/_few/_many/_other`), or
  `errors.authTooManyAttemptsNoWait`.
- `fieldErrorMessageKey(code)` maps field codes inside `validation.failed`
  (`FIELD_ERROR_KEYS`, fallback `errors.field.invalid`). `fieldMessageKey(code, isChoice)` reads
  `required` on a radio choice as `errors.field.choiceRequired`.
- `failureMessages(error, fields, choiceFields)` splits a failed save into per-field messages for
  the form's own fields, or one form-level `ErrorMessage` when none applies.

## Local store and sync

`@/shared/sync` (`web/src/shared/sync/`; semantics in [`sync.md`](sync.md#client)) is the only
code that touches IndexedDB or the sync API:

- `localStore.ts`: the Dexie database `family-app`: a table per entry of `SYNCED_TABLES`
  (`member`, `child`, `child_field`, `child_field_value`, `list`, `item`, `category`, `item_history`; `child_field`
  and `list` came with store version 2, `item`, indexed by `listId`, with version 3, `category`,
  indexed by `listId`, with version 4, `item_history`, indexed by `listId`, with version 5;
  version 6 indexes `list` by `childId`, for Child lists; `child_field_value`, indexed by
  `childId` and `childFieldId`, came with version 7). A row holds the
  fields the pull sent and `version`, the Version it was pulled with (none on a row created here
  until the pull brings it back). Also there:
  `outbox` (`++seq`) and `meta` (the stored Version, the owner: the Member whose data it holds,
  and the owner copy the app starts from offline). Internal to the folder, except
  `claimLocalStore(memberId)` (below) and `saveOwnerCopy(owner)` / `ownerCopy()` (see "Offline
  cold start" above).
  `wipeLocalStore()` clears every table Dexie knows (`localStore.tables`), so a table added later
  is wiped without changes there.
- `engine.ts`: `startSync()` / `stopSync()` / `requestSync()`, `onSessionEnded(listener)`. `AuthGuard`
  first calls `claimLocalStore(memberId)` (keeps the store when it is that Member's or nobody's,
  wipes it when it is another Member's), shows «Загрузка…» until it is done, then starts the
  engine while the Member is logged in and the server has confirmed the session (keyed on the
  Member id; not while started offline from the device) and stops it otherwise. When a push or
  pull gets a `401` the engine stops and `onSessionEnded` listeners are told: `AuthGuard` then
  sets the session's Member to none, so `/login` shows with `state.from` = where the Member was,
  store and Outbox kept; logging in as the same Member goes back there and resumes.
- Logout (`useLogout()` in `features/auth`, used by `LogoutSection`): `flushOutbox()` sends the
  whole Outbox now (pausing the engine meanwhile; it resumes afterwards, except after a `401`) and
  rejects with the `ApiError` when it can't. Any failure, an unreachable server or a `401` (the
  session already gone), opens the unsent-changes warning; «Выйти» there goes on without them.
  After the server's logout (`auth.required` counts as logged out), or when the logout itself
  can't reach the server (then a pending logout, see the auth guard), `stopSyncAndWipe()` stops
  the engine and wipes the store: an explicit logout always wipes, owner copy included.
- `liveUpdates.ts`: `openLiveUpdates(onNewerVersion)`, opened by `startSync` and closed by
  `stopSync`. One `EventSource` on `/api/sync/events`; a `changed` event whose Version is above
  the stored one calls `requestSync()`, any other causes no pull. When the browser gives up on the
  stream (`readyState` `CLOSED` after an error: an error answer such as `401` or `502`), it is
  reopened with backoff (1 s doubling to 30 s), and at once on `online`, on the server becoming
  reachable, or on the app returning to the foreground. Internal to the folder.
- `rows.ts`, what features use:
  - `useRows(table)`: every local row, live (Dexie `liveQuery`), `undefined` until the first read;
    unordered, untyped (`Row`): the feature sorts and casts (`as Child[]`);
  - `useSyncedRows(table, inOrder)` → `{load, save(id, fields), remove(id)}`: a feature's whole
    table on the local store; `load` is a `LocalLoad` (`loading` until the first read, then
    `ready` with the rows sorted by `inOrder`; it never fails); `save` is `upsertRow`, `remove`
    `deleteRow`. `useChildren`, `useChildFields` and `useLists` are built on it;
  - `upsertRow(table, id, fields, local?)`: create (all required fields) or set the given fields,
    of which only those that differ from the local row are written and sent (read in the same
    transaction; nothing differs, nothing written), so a screen passes just the changed field and
    a change the other Member made meanwhile stays; `local` fields go only into the local row and the Outbox entry, never to the server,
    until the server's copy replaces them (an Item's `doneHereAt`); `deleteRow(table, id)`. Both write the row and the Outbox in one transaction and resolve at
    once, online or not;
  - `useSaveRejection()` → `{message, dismiss}`: the message about the last operation the server
    rejected (`saveRejection.ts`, I3: `list.not_found`, `list.owner_only`, `list.kind_immutable`,
    `list.wish_shared_only`, `child_field.value_type_immutable`, `sync.read_only`,
    `item.list_not_todo`, `item.due_time_without_due_date`, `item.assignee_on_private_list`,
    `item.assignee_not_found` map to
    `sync.rejected.*`, «Не удалось сохранить: …» with the reason; any other code to
    `sync.saveRejected`, plain «Не удалось сохранить»). It is recorded whatever screen is open and
    cleared by the Member's next change, `dismiss()` or a logout. Its one user is
    `app/SaveRejectedToast`, placed next to `AppShell` in `routes.tsx`, which shows it in a `Toast`
    once, wherever the Member is (not in a screen's footer: the screen that made the change may
    be gone).

**Adding a syncable table** on the client: add the name to `SYNCED_TABLES` and declare it in a new
`this.version(n).stores({...})` in `localStore.ts` (keep the older versions as they are, never drop
`outbox`); the pull fills it, and the feature's hook reads and writes it with `useSyncedRows` (or
`useRows` and `upsertRow` / `deleteRow`). Rows that belong to a row of another table (an Item to
its List, a Child field value to its Child and to its Child field) get an index on the parent's id and a line in `DEPENDENT_TABLES`, so they go with it. The backend side is in [`backend.md`](backend.md#adding-a-syncable-table).

## Data access

Each synced data feature has one hook that is its only data access. Components never call `api`,
Dexie or `@/shared/sync`'s writers directly; ESLint enforces it (`data-access/components-use-hooks`
in `web/eslint.config.js`: no sync writers, `@/shared/sync/*` internals or Dexie in a `.tsx`).
Online-only screens (S4) call their feature's `*Api.ts` directly. The synced hooks:

- `useChildren()` → `{load, save(id, fields), remove(id)}` (`useSyncedRows('child', …)`): `load`
  is `loading` until the first local read, then `ready` with the Children in order (birthday, then
  name by `Intl.Collator('ru')`, then id); it never fails. `save` resolves at once, offline too:
  the «Новый ребёнок» sheet passes every field, the Child screen only the field that changed, and
  only fields that differ from the local row are sent, so a change the other Member made meanwhile
  stays. `newChildId()` uses `crypto.randomUUID()`; the sheet gets its id once when it opens.
- `useChildFields()` → `{load, add(id, name, valueType), rename(field, name),
  move(field, to), remove(field)}` on the local store and the Outbox (`useSyncedRows`), like
  `useChildren()`: every write resolves at once, offline too, and sends only what it changes
  (`rename` the name, `move` the position, `add` all three fields). `newChildFieldId()` makes the
  id once when the «Новое поле» sheet opens. `move` takes the field's index after the move;
  `positionAfterMove(fields, id, to)` gives it the midpoint between its new neighbours, or one past
  either end, so a reorder is a single-record change. A new field goes one past the last.
  Ordering is `position`, then id.
- `useChildFieldValues(childId)` → `{values, save(field, value)}` (#91; `child-fields`): the
  Child's values on the local store (`useRows('child_field_value')`). `values` is a `Map` from
  Child field id to the value of the **latest** entry of the timeline (ADR-0007), `undefined`
  until the first local read; a field with no entry is absent. Latest is the highest `version`
  (the Version the pull sent the row with, so server arrival, never `recordedAt`); an entry saved
  here and not pulled back yet has none and is later than every pulled one, the last saved first
  among them (device-only `savedHereAt`, `upsertRow`'s `local`). `save` trims the value and
  appends an entry with a new id (`childId`, `childFieldId`, `value`; `''` clears), resolving with
  the value as saved, offline too; a value equal to the latest one (or empty with no entry) writes
  nothing; a `TEXT` value over 1000 code points rejects with `validation.failed` / `too_long`
  without writing, as the server would.
- `useLists()` → `{load, save(id, fields), remove(id)}` (`useSyncedRows('list', …)`), like
  `useChildren()`: `load` is `ready` with every List the pull brought (never the other Member's
  Private ones: the server filters them), by name with `Intl.Collator('ru')`, then id. `save`
  creates (all of `name`, `kind`, `visibility`) or sends only the given fields that differ from
  the current local row (List settings pass only the changed one). `ownerId` and `createdAt` are set by the server and absent locally until the
  pull after the create. `newListId()` makes the id once when «Новый список» opens. Used by
  `ListsSection` (Home), `ListPage` and `ListSettingsPage`. The List screen (`ListPage`,
  `/lists/:id`, back to «Семья») has the List's name as its title and only the Items
  (`ItemsSection`, below); the gear in its nav bar (a `Link` with `icon="settings"`, named
  «Настройки списка», as on Home) opens `ListSettingsPage` (`/lists/:id/settings`,
  `listSettingsPath(id)`), a `Page` «Настройки списка» back to the List (the back button shows its
  name): a `GroupedSection` with the auto-saved «Название» and Visibility
  «Личный» / «Общий» only when the Member is the Owner, or `ownerId` is still unset, and never for
  a Wish list: `hasVisibility(kind)`; the segments are `VISIBILITY_CHOICES`, both in
  `listTypes.ts` and shared with «Новый список»), then on a Shopping list a «Категории» row
  opening `CategoriesPage` (`/lists/:id/categories`, `listCategoriesPath(id)`, #72): a `Page`
  «Категории» back to the settings, one `GroupedSection` with `edit` whose `SortableList` has the
  Categories and the Unnamed category («Без категории», `muted`, no `confirm`: it can only be
  moved) in `categoryOrder()`, each Category renamed in place (auto-saved, «Категория „…“») and
  deleted after «Удалить „…“?» with «N товар останется / товара останутся / товаров останутся в
  списке без категории» (open and Done Items; no message when empty), and an `AddRow` «Новая
  категория» that adds at the end. Any Member who sees the List may do it all, offline too. Then,
  again only for the Owner (or while
  `ownerId` is unset), «Удалить список» in its own `GroupedSection` (`DeleteListSection`, a `ConfirmRow`, «Удалить „{{name}}“ со всем
  содержимым?», then back to Home). A List that is unknown, or disappears while either screen is
  open (deleted, or made Private by its Owner: the pull's tombstone removes it), shows «Такого
  списка нет: возможно, его удалили.» with the back link to Home (`ListMissing`). Kind texts (segment,
  Home subtitle, empty state, Items header, «Новый товар», «Товар «…»», the Done label and the
  Done toggle's name) are in `KIND_TEXTS`. Each Home row's value is the List's count of open
  Items (`useOpenItemCounts()`, 0 included).
  **Child lists** (#90): a List row may carry `childId` (`childIdOf(list)`; `null` or absent for an
  ordinary List). `ListsSection` takes an optional `childId`: without it, it is Home's «Списки» and
  leaves out every List with a Child; with it, it is «Списки» on that Child's page (the routes
  pass it to `ChildPage` as `lists`): only that Child's lists, the same rows (kind as subtitle,
  open Items count), «Списков пока нет» with none, and «Добавить список» opening `NewListSheet`
  with `childId`: «Вид» is TODO / Желания only (`CHILD_LIST_KINDS`), there is no Visibility, and
  the create carries `visibility: 'SHARED'` and `childId` (offline too). A Child list opens the
  same `ListPage` and `ListSettingsPage`. `useListHome(list, homePath)` says where a List lives:
  the Child page, titled with the Child's name (`useChildren()` and `childPath` from
  `features/children`), for a Child list, Home otherwise. It is the List screen's back link, and
  where the settings go after «Удалить список»; the settings' own back link stays the List.
  Settings show no Visibility for a Child list (always Shared; the server enforces it). A missing
  List still goes back to Home (the row that knew its Child is gone).
- `useCategories(list)` → `{categories, add(id, name), rename(category, name), move(category |
  undefined, to), remove(category)}` (#70, #72): the List's Categories on the local store, by
  position, ties by id, `undefined` until the first read. `add` puts the new one one past the
  largest position of its Categories and its Unnamed category (`list.unnamedCategoryPosition`, 0
  when absent), so it goes last; `newCategoryId()` makes its id once its title starts being
  typed. `move` takes a Category, or `undefined` for the Unnamed category, to index `to` of the
  Category order and writes only its position (the midpoint between its new neighbours, as
  `useChildFields().move`): the Category's `position`, or the List's `unnamedCategoryPosition`.
  `remove` deletes the Category only; the server moves its Items to the Unnamed category.
  `categoryOrder(list, categories)` is the Categories and the Unnamed category (`undefined`) by
  position (the Unnamed one first on a tie; `list.unnamedCategoryPosition`, 0 when absent);
  `itemsByCategory(list, categories, openItems)` gives each one's open Items in that order (the
  Shopping list screen's sections), in the order given; an Item whose Category isn't on the device
  is in the Unnamed category. `UNNAMED_CATEGORY_KEY` stands for the Unnamed category wherever
  Categories are keyed by id (a React key, a `SortableList` id).
- `useItemHistory(list)` → `{namesStarting(typed), remove(name)}` (#74, #78): autocomplete from
  the List's Item history on the local store (the server writes it). `remove` deletes the name's
  row through the Outbox (`deleteRow`), offline too, with no confirmation: the server revives it
  the next time an Item gets that name. `namesStarting` gives up to 5 names with a word
  (the start of the name, or after a space) that starts with the typed text, both trimmed and
  lower-cased, newest `lastUsedAt` first (fraction padded as for `createdAt`), ties by name. Only a
  Shopping list's screen uses it.
- `useItems(list)` → `{items, doneItems, earlierDoneItems, add(text, categoryId?), rename(item, text),
  describe(item, description), move(item, categoryId), setDueDate(item, day | null),
  setDueTime(item, time | null), setAssignee(item, memberId | null), setDone(item, done), remove(item)}` on the local store, like `useLists()`: `items` / `doneItems` are
  `undefined` until the first local read. `items` are the List's open Items in the order added:
  by the server's `createdAt`, ties by id; an Item not pulled back yet has no `createdAt` and goes
  after them, ordered by its id, which `newItemId()` makes time-ordered (UUID v7); an Item ticked
  back on returns to its place by the same rule. **On a Todo list** (#84) the open Items with a
  Due date come first, soonest on top: by `dueDate`, on one day those with a `dueTime` (by time)
  before those without, then in the order added; the ones without a Due date follow in the order
  added (`dueKey`: the two fields sort as text). Shopping and Wish lists keep the order added.
  `setDueDate` sends only `dueDate` (`YYYY-MM-DD`), or `dueDate: null` with `dueTime: null` to
  remove the Due date and its time; `setDueTime` only `dueTime` (`HH:MM` or `null`);
  `setAssignee` (#85) only `assigneeId` (a Member's id, or `null` for nobody). `doneItems` are the Done ones, most recently done
  first: by the server's `doneAt` (fraction padded as for `createdAt`), ties by id; one ticked off
  on this device and not pulled back yet has no `doneAt` and goes on top, the last ticked first,
  by its device-only `doneHereAt` (a monotonic ms time written with `upsertRow`'s `local`, never
  sent; `setDone` also clears the old `doneById` / `doneAt` locally the same way, so an Item ticked
  back on and off again goes on top). Device and server times are never compared: pending ticks
  are ordered among themselves, server-stamped ones by `doneAt`. The Outbox pushes ticks in order,
  so the server's copy keeps the Item where it was. **The Done window** (#88): on a Todo list
  `doneItems` are only those whose `doneAt` is today or in the six calendar days before, by the
  device clock and time zone (from local midnight six days ago; one ticked off here and not pulled
  back yet has no `doneAt` and counts as done now), and `earlierDoneItems` the older ones, in the
  same order; the day is read on every render, so the split follows midnight at the next render.
  On Shopping and Wish lists `doneItems` are all of them and `earlierDoneItems` is empty. `add` creates (`listId`, `text`, and
  `categoryId` when added in a Category, `description` when one was typed in the add row's
  «Описание» line, #79; all in one upsert). On a Shopping list `add` first
  looks among the List's Items for one with the same name, both trimmed and lower-cased (#75; an
  open one first, so there are never two open ones): an open one is left as it is and `add`
  resolves with it, writing nothing; with none open, the most recently created Done one (as
  `items` orders them) is set open in the add field's Category
  in one upsert (`done: false`, `categoryId`, `null` for none, and the typed `description` only
  when one was typed; the Outbox sends only what changed), clearing `doneById` / `doneAt` locally like `setDone`, and the server touches its Item
  history. Todo and Wish lists may have two Items with one name. `rename` sends only `text`,
  `describe` only `description` (blank as `null`), `move` only `categoryId` (`null` for the
  Unnamed category), `setDone` only `done`, `remove` deletes; all
  resolve at once,
  offline too. `ItemsSection` on the List screen: a `GroupedSection` headed «Товары» / «Задачи» /
  «Желания» with edit mode («Изменить») while it has open Items; each Item an `EditableRow` with a
  `DoneToggle` (named «Куплено «Молоко»» / «Выполнено «…»» / «Исполнено «…»») as `leading`, its
  text renamed in place (`useAutoSaveText`, required, named «Товар «Молоко»»), its Description
  as the row's `secondary` line (`useAutoSaveText`, named «Описание «Молоко»», placeholder
  «Описание»), on a Todo list its Due date as the row's `caption` (below), deleted from edit
  mode, a swipe or right-click after «Удалить „Молоко“?»; then an `AddRow` «Новый товар» / «Новая
  задача» / «Новое желание» (Enter adds and keeps the focus) with `descriptionLabel` «Описание» on
  every List kind (#79): its icon or ↓ opens the one-line Description under the name, and Enter
  passes both to the same `add`. Footer: «Товаров пока нет» (by
  kind) with no open Items (a rejected new Item leaves the List; «Не удалось сохранить» shows
  app-wide, see `useSaveRejection`). Under it, while there are Done Items, a second `GroupedSection` headed «Куплено» /
  «Выполнено» / «Исполнено» with edit mode: each an `EditableRow`, `muted`, with its ticked
  `DoneToggle` (untick puts it back among the open ones), deleted the same ways. A Shopping
  list's is headed by «Очистить» too (the `GroupedSection` `action`; Todo and Wish lists get
  none): an `ActionSheet` «Очистить 3 товара?» (`lists.confirmClearBought`, plural by `count`) /
  «Очистить» (destructive) / «Отменить», then `remove()` for every Done Item shown, so one Item
  delete each and no list-level operation (spec #67, ticket #71). An Item the other Member ticked
  off that no pull has brought yet isn't shown, so it stays.
  **A todo item's row line** (#84, `itemCaption` → `EditableRow` `caption`): under the name and
  the Description, the Due date in a small grey line, on open and Done rows, also while the row is
  edited: the day as «Сегодня» / «Завтра» / «Вчера», else «15 нояб.», with the year when it isn't
  this one («5 янв. 2027 г.»), and the time after a comma («15 нояб., 15:00»; `dueDates.ts`:
  `dueDayText`, `dueDateText`, i18n `lists.due.*`). On an open Item an overdue Due date is red
  (`tone: 'destructive'`; `isOverdue`: without a time from the next day's midnight, with a time
  once the clock is past it); a Done Item's is never red. Everything is by the device's clock and
  time zone, read when the row renders, so a row turns red at its next render after the moment
  passes (as the Done window follows midnight). After the Due date comes the Assignee's name
  (#85): «15 нояб. · Даша» (`lists.assignee.afterDueDate`, a part of its own, never red), or the
  name alone when there is no Due date; the name is the Member's `displayName` from
  `useFamilyMembers()`, read once per section and passed to the rows. It shows on a Shared list
  only: on a List just made Private the Items may still hold an `assigneeId` until the server's
  copies arrive, and the row leaves it out at once. Repeat (#86–#87) adds its mark between the
  two. Shopping and wish rows have no such line.
  **A Todo list's «Выполнено»** (#88) holds only `doneItems` (the last 7 days) and, while there
  are `earlierDoneItems`, ends with a chevron row «Выполненные ранее» (a `ListRow` as the
  section's `after`, so not part of the edit-mode list); with only older Done Items the section is
  that row alone, without «Изменить». The row opens `DoneEarlierPage`
  (`/lists/:id/done-earlier`, `listDoneEarlierPath(id)`): a `Page` «Выполненные ранее» back to
  the List (the back button shows its name) with one section of the same Done rows (`DoneItems`,
  shared with the List screen): most recent first, unticking puts the Item back among the List's
  open ones, deleting asks first (edit mode, swipe or right-click), no «Очистить». When the last
  one goes the section stays with the footer «Выполненных ранее задач нет». A List that is not a
  Todo list, is unknown or disappears shows `ListMissing`, as «Категории» does for a List that is
  not a Shopping list. Nothing is ever removed by the window: a Done todo item leaves both places
  only when a Member deletes it.
  **A Shopping list** (`ShoppingItems`, #70) shows the same «Товары» section while it has no
  named Categories. With some, the open Items are in one section per `itemsByCategory()` entry:
  a Category's headed by its name (edit mode while it has Items), the Unnamed category's untitled
  (`GroupedSection` `label` «Без категории», with edit mode while it has Items all the same, its
  «Изменить» alone above the cell); every section shows even with no
  open Items, ends with its own «Новый товар» that adds into it, and has no «Товаров пока нет».
  Under them, on every Shopping list, a «Новая категория» row (`ListRow`, accent) in an untitled
  group: tapping it shows a new section at the end whose title is being typed (`headerField`,
  «Название категории»); Enter (or leaving it) with a name adds the Category and focuses its
  «Новый товар» (`AddRow` `focus`), an empty one or Esc adds nothing. The Done section stays one
  flat group; an Item ticked back on returns to its Category. Todo and Wish lists show no
  Categories. With named Categories, an open Item being edited has the Category chip (#73,
  `EditableRow` `chip`, a `MenuChip`) under its Description: its Category's name or «Без
  категории», named «Категория: Еда» (`lists.itemCategory`); the menu is `itemsByCategory()`'s
  entries, «Без категории» (grey) in the Unnamed category's place, the current one ticked, and
  picking another calls `move()`, so the Item goes to that section at once, offline too. Every
  «Новый товар» of a Shopping list has `AddRow` `suggest` from
  `useItemHistory().namesStarting`: while it is focused and has text, the suggestions show under it
  (`SuggestionRows`; its × calls `remove()` through `AddRow` `onRemoveSuggestion`, keeping the
  typed text and the focus), and tapping one calls the same `onAdd` as Enter, so the Item goes into that
  field's Category (none for the «Товары» or the untitled section), offline too. Todo and Wish
  lists get no suggestions. When `add` (Enter or a suggestion) resolves with an open Item of that
  name, `ItemsSection` highlights its row for 1.5 s (`EditableRow` `highlighted`: scrolled into
  view and tinted); the add field is emptied and keeps the focus as after any add.
  **The Item screen** (`ItemPage`, `/lists/:id/items/:itemId`, `listItemPath(listId, itemId)`,
  #83) is for an Item of every kind, back to its List (the back button shows the List's name),
  titled «Товар» / «Задача» / «Желание» (`KIND_TEXTS[kind].item`). It reads the List through
  `useLists()` and the Item through the same `useItems(list)` (open, Done and, on a Todo list, Done earlier), so it works
  offline and from a deep link. One `GroupedSection` with «Название» (`InputRow`, `rename`,
  required) and the large «Описание» (`TextAreaRow`, `describe`), both `useAutoSaveText` like the
  row's; one with the Done toggle (a `ListRow` titled by the kind's Done word with the
  `DoneToggle` as `leading`; `setDone`), whose footer says who added the Item and, when Done, who
  marked it Done: «Добавила Анна, 12 нояб.», «Купила / Выполнила / Исполнила Анна, 14 нояб.»
  (`lists.addedBy`, `KIND_TEXTS[kind].doneBy`, by the Member's Grammatical gender, see i18n; the
  day by the device's clock, with the year when it isn't this one); on a Todo list only, a section
  with the todo fields (`TodoFields`, #84): «Срок» (`DateRow`, `setDueDate`) and «Время»
  (`DateRow` `type="time"`, `setDueTime`; `disabled` while there is no «Срок»), each auto-saved
  with `useAutoSaveText` (blur, Enter, or its ⊗), offline too; a date without a time is fine, and
  clearing «Срок» clears «Время» with it. On a Shared list (`list.visibility === 'SHARED'`, so
  on every Child list) the section also has «Ответственный» (#85): a `SelectRow` with «Никто»
  and then each Member of `useFamilyMembers()` by name, saved when chosen (`useAutoSaveChoice`,
  `setAssignee`), offline too; a Private list has no such row. On a Done Item they are read-only
  (`DoneTodoFields`: plain `ListRow`s with the day as on the row, the time, and on a Shared list
  the Assignee's name; «Нет» / «Никто» for none) and editable again
  once it is ticked back on; later todo fields (#86–#87) join this section and follow the same
  rule. Then «Удалить» (`ConfirmRow`,
  «Удалить „Молоко“?», `remove`, back to the List replacing the history entry). The Member comes
  from `useFamilyMembers()`; a line shows only once the server's `creatorId` / `createdAt`
  (`doneById` / `doneAt`) are on the device, so an Item added or ticked on this device gets it
  with the next pull. Name and Description stay editable on a Done Item. An Item that is unknown,
  belongs to another List, or disappears while the screen is open (deleted, also by the other
  Member) shows «Такого товара нет: возможно, его удалили.» (by kind,
  `KIND_TEXTS[kind].itemNotFound`) with the back link to the List; a missing List shows
  `ListMissing` as on its other screens. The screen is opened from the List screen: an open
  Item's row being edited ends with «Подробнее» (`EditableRow` `details`, which first saves what
  was typed in the row), and a Done row's text is a link to it (`EditableRow` `textTo`; plain
  text in edit mode). Out of editing, a row shows up to two lines of its Description.
- `useFamilyMembers()` (`@/features/members`) → the Family's Members on the local store (the
  pulled `member` rows: `displayName`, `grammaticalGender`) as a `Map` by id, `undefined` until
  the first local read: for saying who did something, offline too. Read-only.
- `useMembers()` → `{load, retry, replaced}` (online REST).
- `useLogout()` → `{logOut({discardUnsent?}), pending, error, unsentWarning, dismissWarning}`:
  the only data access of `LogoutSection` (Outbox flush, logout request, pending logout, wipe;
  see "Local store and sync").
- REST-backed `load` (`Load<T>`) is `{status: 'loading'} | {status: 'failed', error} |
  {status: 'ready', value}`; a local-store `load` (`LocalLoad<T>`) has no `failed`.

The load / failed / retry part of REST-backed data is shared: `useLoad(fetch, key?)` from
`@/shared/load` returns `{load, retry, update}`. It fetches on mount and when `key` changes, drops
answers that arrive after unmounting, and `update(change)` edits the loaded value after a write.
`useMembers`, `InvitesSettings` and `AuthGuard` use it, and
`features/auth/useLinkCheck` builds the Invite and password reset link check on it.

Auth, Invites and Member account changes stay online-only REST permanently (S4 exception; logout
also works offline through a pending logout, see the auth guard).

`crypto.randomUUID()` needs a secure context: HTTPS, or `localhost` in development.

Invites (`members/InvitesSettings.tsx`, used by `MembersSettings`): `useInvites()` loads the
active Invites once for both sections. `useInviteMember()` gives «Взрослые» its «Пригласить
взрослого…» row: one tap sends `POST /api/invites` and, in the same tick (Safari keeps the user
activation only that long), calls `navigator.clipboard.write([new ClipboardItem({'text/plain':
blobPromise})])` with the link still pending. Copied → «Ссылка скопирована» (`status`) in the
footer for `COPIED_MS` (3 s). Not copied (refused, or no `ClipboardItem`) → a «Новая ссылка» row
with the full link and «Скопировать» (`clipboard.writeText` on a fresh tap); if that fails too the
footer asks to copy by hand. `navigator.share` is not used. `InvitesSection` («Приглашения»; a
«Активных приглашений нет» row when there are none) lists them as `EditableRow`s «Ссылка · до 14 ноября», revoked from
edit mode, a swipe or right-click, always after the `ActionSheet`. Confirmations are never
`window.confirm`.

Child color palette: `web/src/shared/palette/childColors.json` (`[{code, hex}]`) is the single
definition. `@/shared/palette` exports `CHILD_COLORS` and `childColor(code)`; the backend validates
against the same file (see [`backend.md`](backend.md#stack)). Each code's Russian name is
`childColors.<code>` in `ru.json`; `palette.test.ts` checks every code has one.

## i18n

- One resource file, `web/src/shared/i18n/locales/ru.json`; `lng` and `fallbackLng` are `ru`,
  no language switcher, `<html lang="ru">`. Set-up in `shared/i18n/i18n.ts`, provider in
  `app/AppProviders.tsx`.
- Keys are nested by feature or area (`login.title`, `children.age…`, `errors.field.required`,
  `childColors.coral`). `i18next.d.ts` types `t()` against `ru.json`, so an unknown key is a type
  error.
- `eslint-plugin-i18next` `no-literal-string` in `jsx-only` mode flags literal JSX text and the
  attributes `aria-label`, `aria-description`, `aria-placeholder`, `aria-roledescription`,
  `aria-valuetext`, `title`, `alt`, `placeholder`, `label` in `src/**/*.tsx`. Tests are exempt.
- **Plurals**: i18next suffixes `_one`, `_few`, `_many`, `_other` with `count` (see
  `errors.authTooManyAttempts_*`).
- **Grammatical gender**: a sentence about a Member's action uses i18next `context` with the
  Member's `grammaticalGender` lower-cased (`masculine` / `feminine`), i.e. keys `<key>_masculine`
  and `<key>_feminine`, plus the plain `<key>` as the neutral fallback when the value is missing.
  The Item screen's footer lines are the first (`lists.addedBy`, `lists.doneBy.<kind>`; their
  neutral form is «Добавлено: Анна, 12 нояб.»). The choice itself is asked
  as «Пол» with «Мужской» / «Женский» (keys `grammaticalGender.label`, `.masculine`,
  `.feminine`; nothing pre-selected): `GrammaticalGenderRow` (a `SegmentedControl`) from
  `features/auth`, at registration and in «Ваш профиль».
- The app name «Семья» is `app.name`; `vite.config.ts` puts it into the manifest and replaces
  `%APP_NAME%` in `index.html`.

## Look and theme

Everything visual is specified in [`design.md`](../design.md). In short:

- Tailwind CSS 4 via `@tailwindcss/vite`; tokens (colours, type scale, font) are CSS variables in
  `@theme` in `web/src/shared/ui/theme.css`, with Tailwind's default palette and type scale
  switched off. The dark theme redefines the variables under `:root[data-theme='dark']`.
- An inline script in `web/index.html` applies the theme before React starts: `localStorage`
  `theme` (`light` / `dark` / absent = follow the system) → `<html data-theme>` and the
  `theme-color` meta. It re-applies on a system change or a `storage` event.
  `src/app/themeScript.test.ts` runs that script in jsdom.
- Screens render as `Page` (large-title nav bar, 640px centred column, safe-area padding) inside
  `AppShell`; the auth screens as `CenteredPage` (app icon, title, 400px column centred both ways);
  the start-up states of `AuthGuard` as `StatusScreen` (message only).
- Offline indicator: a crossed globe in the `Page` nav bar's trailing slot while
  `useServerReachable()` is `false`. Each mounted `Page` registers its nav bar with `AppShell`;
  with none (auth screens, the start-up error in `AuthGuard`) `AppShell` shows the globe in the
  same top-right spot. `AppShell` also holds the `role="status"` message announcing «Нет связи с
  сервером» / «Связь с сервером восстановлена». Nothing is disabled offline; saves fail with their
  usual message, except synced data (Children), which saves locally: there the globe is the only
  sign that changes are waiting to be sent.
- Settings «Оформление» (`features/settings/AppearanceSection`, `themeChoice.ts`) writes the
  choice to `localStorage` `theme` (removes it for «Авто») and dispatches
  `new StorageEvent('storage', {key: 'theme'})`, so the theme script applies it at once.

## Settings

`/settings` is one `Page` of `GroupedSection`s (in `Sections`), back to «Семья»: «Взрослые» (a
row per Member: initial, name, email, «(вы)» on the own one; not tappable; then «Пригласить
взрослого…»), «Приглашения» (an edit-mode list, see Invites above), «Ваш профиль» (Имя as an auto-saved `InputRow`, «Пол» as an auto-saved
`SegmentedControl`; each change `PATCH`es only its own field and updates the session and the
Members list; then the «Изменить пароль» chevron row), «Дети» (below), «Поля профиля» (below),
«Оформление», and the red «Выйти» row (`LogoutSection` from `features/auth`, a `ConfirmRow`;
after logging out the guard shows `/login`). Logout sends the Outbox first; when that fails
(other than `401`) a second `ActionSheet` warns «Нет соединения с сервером. Несохранённые
изменения будут потеряны» with a red «Выйти» (log out, wipe) and «Отменить» (keep everything). A
`401` there means the session already ended: the guard shows `/login` and the store stays for the
same Member. When `POST /api/auth/logout` can't reach the server either, the device logs out on
its own (wipe, `/login`) and tells the server later (pending logout, see the auth guard); any
other failure of it keeps the device logged in and the footer says so. `app/routes.tsx` passes `HOME_PATH` in as
`homePath`, since `home` already imports `settings`. Auto-save and its failure footer are
the `shared/ui` hooks `useAutoSaveText`, `useAutoSaveChoice` and `autoSaveMessages` (see
`design.md`). Other footer lines come from `useFooterLines()`: `failure(error, retry?)` for a
failed delete or load, `form({...})` for a form's field errors and its failure. The edit-mode
lists («Приглашения», «Дети», «Поля профиля») keep their edit mode, the row being deleted and the
failure in `useEditableList()`.

The password screen `/settings/password` (`PasswordPage`, `PASSWORD_PATH` from
`features/members`) is a `Page` «Изменить пароль», back to «Настройки»: «Текущий пароль» and
«Новый пароль» as `InputRow`s in a `Form`, «Готово» in the nav bar's trailing slot, enabled once
both are filled. Enter does the same as «Готово»; Esc (the `Form`'s `onCancel`) and the back
button go to Settings without saving. On success it navigates to Settings with
`state.passwordChanged`, replacing its own history entry (browser-back doesn't reopen it), and «Ваш профиль» shows «Пароль изменён» in its footer
(`usePasswordJustChanged()`, which then clears the flag from the history entry so browser-back doesn't show it again); on failure the message goes in the footer under the fields (a wrong
current password empties that field). `app/routes.tsx` passes `SETTINGS_PATH` in as
`settingsPath`, since `settings` already imports `members`.

«Дети» (`ChildrenSettings`) is an edit-mode list of `EditableRow`s: the Child's colour
(`Swatch`), name, age on the right («7 лет», «5 месяцев» under a year, «меньше месяца» under one, nothing without a birthday
or before it; `i18n` plurals `children.age.years_*` / `months_*`, computed from the device's
date) and a chevron to `/settings/children/:id` (`childSettingsPath(id)`). Edit mode deletes only
(Children have no order); a swipe and right-click delete too; each asks first, «Удалить „Маша“?»
with the message «Списки и профиль ребёнка тоже будут удалены.» (`children.deleteTakesAll`; the
server deletes the Child lists with the Child, #90). «Добавить ребёнка»
(the section's `after` row) opens `NewChildSheet`: a `Sheet` «Новый ребёнок» with the same rows
as the Child screen (`ChildRows`), name and colour required, saved only with «Готово» (at once, also offline);
the Child appears in the list in order. With no Children the footer says «Детей пока нет». A
rejected new Child leaves the list (and «Не удалось сохранить» shows app-wide, as for every
rejected change).

«Поля профиля» (`ChildFieldsSettings`) is an edit-mode list of `EditableRow`s inside a
`SortableList`: each row's name is a text field (`input`, `useAutoSaveText`, named «Название поля
«Вес»»; empty is refused without a request) that renames the field in place on blur or Enter,
with the value type («Текст» / «Дата») on the right; it can't be changed (ADR-0007). Each row
reports its save failure up to the section's footer (`useRowFailures`). Edit mode shows ⊖ and a
drag handle: dragging (mouse, touch or keyboard) calls `move(field, to)`, which writes only that
field's position. A swipe and right-click delete too; every delete asks («Удалить поле „Вес“?»).
«Добавить поле» opens `NewChildFieldSheet`: a `Sheet` «Новое поле» with «Название» (`InputRow`)
and «Тип» (`SegmentedControl` «Текст» / «Дата», «Текст» chosen), saved only with «Готово» (at
once, also offline); the field goes to the end. Every change shows at once and goes out through
the Outbox. With no fields the footer says «Полей пока нет»; a rejected change shows «Не удалось
сохранить» app-wide (a rejected new field leaves the list).

The Child screen `/settings/children/:id` (`ChildSettingsPage`, `CHILD_SETTINGS_PATH`; `app/routes.tsx` passes
`settingsPath` as for the password screen) is a `Page` titled with the Child's name, back to
«Настройки». It loads through `useChildren()` like the list (so a deep link works) and shows
`ChildRows`: Имя (`InputRow`, `useAutoSaveText`; empty is refused without a request), Цвет
(`ColorChoice`, `useAutoSaveChoice`), День рождения (`DateRow`, `useAutoSaveText` with `''` for
none). Each change saves only that field through `useChildren().save` (local store + Outbox), so
it shows at once offline too; after a rejection («Не удалось сохранить» app-wide) the rows show
the server's value again. Then a red «Удалить ребёнка» `ConfirmRow`: the `ActionSheet`
«Удалить „Маша“?» with the same message «Списки и профиль ребёнка тоже будут удалены.», then back to Settings (replacing the history entry). An unknown id shows «Такого ребёнка
нет: возможно, его удалили.».

## Home «Дети» and the Child page

Home (`HomePage`) is `Sections` of `ChildrenTiles` and `ListsSection`. `ChildrenTiles`
(`features/children`, ticket #89) reads `useChildren()` and shows «Дети» as a `TileGrid` above
«Списки»: a `Tile` per Child in the Children order (oldest first), filled with the Child color
(`childColor(code)?.hex`; grey for an unknown code), the name and under it the age as in Settings
(`useAge()`; the name only without a birthday or before it), each a link to the Child page. While
the Children load, and with none, it renders nothing, so Home has no «Дети» header at all.

The Child page `/children/:id` (`ChildPage`, `CHILD_PATH`; `app/routes.tsx` passes `homePath`) is
a `Page` titled with the Child's name, back to «Семья». Its nav bar action is the text `Link`
«Изменить» to the Child's screen in Settings (`childSettingsPath(id)`, which goes back to
Settings as before). «Профиль» is a `GroupedSection` with one plain `ListRow` «День рождения»
whose value is the date and the age, «12.04.2019 · 7 лет» (`children.birthdayWithAge`; the date
alone before the birthday; «Не указан» with none), read-only. Under it, in the same section
(`ChildProfileSection` from `features/child-fields`, which takes the birthday row as its
children; #91), a row per Child field in the Settings order (`useChildFields()`), labelled with
the field's name, holding this Child's latest value (`useChildFieldValues(child.id)`): an
`InputRow` for `TEXT`, a `DateRow` (the browser's date picker, with its clear button) for `DATE`,
each auto-saved with `useAutoSaveText` (text on blur or Enter, a date on blur, Enter or clear).
Clearing a value saves an empty entry; leaving a row as it was saves nothing. A text over 1000
characters is refused with «Слишком длинно» in the footer about its row (`useRowFailures`). The
rows appear once both the fields and the values are read; with no Child fields the footer says
«Полей профиля нет. Добавьте их в Настройках.». Values and Child fields changed on the other
Member's device show live. Under the section, «Списки» has the Child lists (#90): the `lists` component the routes pass in
(`ListsSection` from `features/lists`, given the Child's id; passed in because `lists` already
imports `children` for a Child list's back link), described with `useLists()` above. It loads through `useChildren()`, so a deep link
works, it follows live updates (a rename, a new birthday), and it opens offline after a restart.
An unknown id, or a Child deleted while the page is open, shows «Такого ребёнка нет: возможно,
его удалили.» under the title «Дети», with the back link to Home. Tests:
`children/childTiles.test.tsx`, `children/childPage.test.tsx`, `children/childLists.test.tsx`
(Child lists on the page and off Home, «Новый список» there, a Child list's screen and settings,
the delete warning, the store upgrade to version 6),
`child-fields/childFieldValues.test.tsx` (the profile's values, and the store upgrade to version 7).

## PWA

All PWA configuration is in `web/vite.config.ts` (a second TS config file imported from it triggers
a Vite native-config-loader warning).

- **Manifest**: `name` / `short_name` from `app.name`, `lang: ru`, `start_url` and `scope` `/`,
  `display: standalone`, theme and background `#f2f2f7` (the light `background` token).
- **Icons**: generated at build time by `pwaAssets` (`@vite-pwa/assets-generator`, sharp) from the
  single source `web/public/icon.svg`: 64/192/512, maskable 512, `apple-touch-icon` 180, favicon.
  No PNGs are committed. The house is the accent `#0062cc`; maskable and Apple icons are padded on
  white. `injectThemeColor: false`: `index.html` has its own `theme-color`, switched by the theme
  script.
- **iOS meta tags** in `web/index.html`: `apple-mobile-web-app-capable`,
  `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` (`black-translucent`: the page
  draws under the status bar, the nav bar pads by `safe-area-inset-top`),
  `apple-mobile-web-app-title`, `viewport-fit=cover`.
- **Service worker** (`sw.js`, registered by the injected `registerSW.js`): precaches the built
  shell (`**/*.{js,css,html,svg,png,ico}` + manifest), no runtime caching, navigation fallback to
  `index.html` except `/api` and `/actuator`. So the shell opens offline, and the API is always
  fetched from the network.
- **Updates**: `registerType: 'autoUpdate'` with `skipWaiting` and `clientsClaim`. A new worker
  installs in the background and takes over, but the open page is never reloaded; the next launch
  runs the new code. `cleanupOutdatedCaches` removes old precaches. The backend serves `sw.js`,
  `index.html` and the manifest with `no-cache` and `/assets/**` as immutable.
- Installability was checked with headless Chrome (`Page.getInstallabilityErrors`); Lighthouse no
  longer has a PWA audit.

## iOS and macOS

- An installed Home Screen app has its **own cookie jar**, separate from Safari. The Member logs
  in once inside the installed app even if already logged in in Safari, and logging out in one does
  not affect the other.
- ITP's 7-day cap applies to cookies written by script. The `SESSION` cookie is server-set and
  `HttpOnly`, so it lasts its `Max-Age` (180 days, sliding). If the script-readable `XSRF-TOKEN`
  cookie is gone, the `GET /api/auth/session` at the next launch issues a new one.
- Install on iPhone: open `https://<DOMAIN>` in Safari → Share → «На экран „Домой“» → Add. It
  opens full-screen with the name «Семья».
- Install on a Mac: Safari → File → Add to Dock.
- HTTPS is required for install, the service worker and `crypto.randomUUID()`.

## Testing

- Tests sit next to the feature (`<feature>/*.test.tsx`) and render the **whole app**:
  `renderApp(path)` from `@/test/renderApp` mounts the real `routes` and `AppProviders` in a memory
  router and returns Testing Library's result plus `location()` (path + search + hash).
- The API is mocked at the network layer by MSW: `server` from `@/test/server`, handlers added per
  test with `server.use(...)`. `src/test/setup.ts` starts it with `onUnhandledFrame: 'error'`
  (MSW 3's name for `onUnhandledRequest`), so any request without a handler fails the test.
- The sync API is always answered by the fake sync server `syncServer` (`@/test/syncServer`,
  installed in `server.ts`, emptied after each test). It behaves like the real one (Versions,
  per-field Last write wins, delete wins, tombstones; a deleted Child or Child field takes its
  Child field values, in `CASCADES`; a Child field value is stamped with `recordedAt`, never
  changes once recorded, and is `ignored` for a deleted or unknown Child or Child field):
  `seed(table, rows)`, `change(table, id,
fields | 'deleted')` (the other Member's change), `row(table, id)` (the server's copy),
  `operations(table)` / `pushes` (with `csrf`) / `pulls`, `goOffline()` / `goOnline()` (MSW network
  error), `rejectWhen(op => …)`, `holdPulls()` (returns `release`). Tests trigger a reconnect with
  `window.dispatchEvent(new Event('online'))` and the foreground with a `visibilitychange`
  (after setting `document.visibilityState` to `visible`: jsdom says `prerender`).
- `fake-indexeddb/auto` gives jsdom IndexedDB, so the real Dexie store runs; `setup.ts` stops the
  engine and empties the store after each test. Rendering the app twice in one test is an app
  restart: the second render reads what the first left in the store.
- `FakeEventSource` (`@/test/eventSource`) is the global `EventSource` in every test:
  `FakeEventSource.latest()`, `.instances`, `.open()`, `.emit(type, data)`, `.fail()`, `.closed`.
  A live update is `sse.emit('changed', JSON.stringify({ version: syncServer.latestVersion }))`
  after changing the fake server; a drop the browser gives up on is `sse.readyState =
FakeEventSource.CLOSED; sse.fail()`. See `features/children/liveUpdates.test.tsx`.
- Every `renderApp` test must mock `GET /api/auth/session` (`sessionHandler({...}).handler`; its
  `calls` counts requests). Every test that renders `/settings` must also mock `/api/members`
  and `/api/invites`.
- Lists, Items, Categories and Item history tests (`lists/lists.test.tsx`, `lists/items.test.tsx`,
  `lists/categories.test.tsx`, `lists/categoriesScreen.test.tsx`, `lists/itemHistory.test.tsx`,
  `lists/reAdding.test.tsx`, `lists/doneEarlier.test.tsx`, `lists/itemScreen.test.tsx`: the Item
  screen, which also seeds `member` rows for its footer lines; `lists/dueDate.test.tsx`: a todo
  item's Due date on the Item screen and the row, overdue, the order, with the device clock
  fixed; `lists/assignee.test.tsx`: a todo item's Assignee on the Item screen and the row, and
  what making the List Private does to it) build
  their rows inline and seed them with
  `syncServer.seed('list' | 'item' | 'category' | 'item_history', …)`; `items.test.tsx` and `categories.test.tsx`
  also guard the store upgrades to versions 3 and 4 (an unsent operation in a version 2 store is still sent),
  and `dueDate.test.tsx` that a version 5 store from before Due dates still sends its unsent
  operation and its Items take a Due date, and `assignee.test.tsx` the same for a version 7 store from
  before Assignees (a new Item field needs no store version); the fake server doesn't filter by Visibility or check the Child list rules (backend concerns), but deleting a Child there deletes its Child lists and their Items, and making a List Private there removes the Assignee from all its Items, as on the real server.
- Fixtures in `@/test/fixtures`: Members `anna`, `boris`; Children `masha`, `petya` (sync rows, for
  `syncServer.seed('child', …)`); Child fields `weight`, `height` (sync rows, for
  `syncServer.seed('child_field', …)`); handlers `membersHandler`, `invitesHandler`,
  `sessionHandler`.
- The device clock: `vi.useFakeTimers({ toFake: ['Date'], now })` in `beforeEach` and
  `vi.useRealTimers()` after (`children.test.tsx` for ages, `doneEarlier.test.tsx` for the Done
  window, whose Done times are built from local dates so the tests pass in any time zone,
  `dueDate.test.tsx` for «Сегодня» and overdue).
- A deep link to a screen renders with an empty store first, so «Такого списка нет» may show for
  a moment before the pull. A test that expects it as the final state fills the store first
  (render the List, wait, `unmount()`, render the deep link: an app restart).
- Query by role and label; assert on the Russian text the user sees (T1). Set
  `document.cookie = 'XSRF-TOKEN=…'` to check the CSRF header.
- To test copying, stub `ClipboardItem` (`vi.stubGlobal`) and `navigator.clipboard` (`write`,
  `writeText`) after `userEvent.setup()`, which installs its own clipboard (`invites.test.tsx`).
- jsdom lays nothing out: `test/setup.ts` stubs `scrollIntoView` (a no-op); a highlighted row is
  checked by its `data-highlighted` (`reAdding.test.tsx`), the tint by screenshots; an overdue
  Due date by its `data-tone="destructive"` (`dueDate.test.tsx`), the red by screenshots.
- Right-click: `user.pointer({keys: '[MouseRight]', target})`, then the `menuitem`. jsdom has no
  `matchMedia`, so `RowContextMenu` treats the pointer as fine there. Swipes can't be tested in
  jsdom (screenshots instead).

## Screenshots

What jsdom can't check (layout, touch vs pointer, narrow vs wide, light vs dark, swipes) is checked
by looking: `scripts/screenshot.sh --out <dir>` runs the app from this checkout and shoots every
route in `scripts/screenshot/screens.mjs` at 390px touch and 1280px mouse, in light and dark. A
change to a screen adds or updates its route there. Options, seed data and route format:
`scripts/screenshot/README.md`.
