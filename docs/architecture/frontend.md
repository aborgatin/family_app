# Frontend

What exists in `/web` after Spec #1 (M0 + M1) and the M1.5 UI foundation (spec #35). Rules:
[`CODING_STANDARDS.md`](../../CODING_STANDARDS.md) (M3, I2, I3, S4, T1). Look, tokens and
component rules: [`design.md`](../design.md). Backend contract: [`backend.md`](backend.md).

## Stack

React 19, TypeScript 6 (`strict`, `noUncheckedIndexedAccess`), Vite 8, `vite-plugin-pwa` 2
(Workbox), React Router 8 (import from `react-router`), i18next 27 + react-i18next, Tailwind CSS 4
(`@tailwindcss/vite`), Radix primitives (`@radix-ui/react-popover`, `-dialog`, `-context-menu`, only inside
`shared/ui`),
`lucide-react` (only inside `shared/ui/Icon.tsx`), Vitest 5 + Testing
Library + MSW 3, ESLint 10 flat config, Prettier 3. Node 22 or newer.

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
  app/                  routes.tsx, AppProviders.tsx (I18nextProvider)
  features/
    auth/               session, guard, setup (bootstrap), login, LogoutSection, Invite acceptance,
                        password reset; LinkScreen (link-check states)
    home/               HomePage: Page «Семья», empty state, gear → Settings
    settings/           SettingsPage (one grouped page), AppearanceSection (theme), SETTINGS_PATH
    members/            MembersSettings: «Взрослые», InvitesSettings, ProfileSection; PasswordPage
    children/           ChildrenSettings («Дети»), ChildPage, NewChildSheet, ChildRows, age, useChildren()
    child-fields/       ChildFieldsSettings («Поля профиля»), NewChildFieldSheet, useChildFields()
  shared/
    api/                API client, error-code mapping, form error helpers
    i18n/               i18next set-up, typed keys, locales/ru.json
    load/               useLoad(): load / failed / retry for anything fetched once
    palette/            Child color palette (childColors.json)
    ui/                 the only place that draws (U1; docs/design.md): theme.css (tokens),
                        AppShell, Page (nav bar), CenteredPage, StatusScreen, Button, Link, Icon
                        (lucide), EmptyState, OfflineIndicator, Form, Sections, GroupedSection,
                        InputRow, DateRow, SegmentedControl, ColorChoice, Swatch, ListRow,
                        LoadingRow, EditableRow, SortableList (dnd-kit), SwipeToDelete,
                        RowContextMenu, Avatar, ActionSheet, Sheet (Radix), Spinner, auto-save
                        hooks (autoSave.ts)
  test/                 renderApp, MSW server, fixtures, setup
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
  (`no-restricted-syntax`, `src/features/**/*.tsx`, tests exempt), forbids raw `button`, `input`,
  `select`, `textarea`, `form`, `a` elements and `className` / `style` props there. A look the kit
  lacks is added to `shared/ui` first, with its section in `design.md`.
- A feature keeps its components, hooks and API calls together; `*Api.ts` files hold the REST
  calls, and only the feature's hook calls them.

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
| `/settings`              | `SettingsPage`      | logged in                      |
| `/settings/password`     | `PasswordPage`      | logged in                      |
| `/settings/children/:id` | `ChildPage`         | logged in                      |

The guard calls `GET /api/auth/session` once at start (and again only on «retry» after a failure;
meanwhile a `StatusScreen` shows «Загрузка…», or the failure with «Повторить»), then:

1. `bootstrapRequired` and not on `/setup` → `/setup`. Not required and on `/setup` → `/`.
2. No Member, not on `/login`, path not public (`isPublic()`: `/reset-password/…`, `/invite/…`) →
   `/login` with `state.from` = path + search + hash.
3. Member present and on `/login` → back to `state.from` (only same-app paths, never `/login`
   itself), else `/`.

It provides `SessionContext`; screens read it with `useSession()` (`@/features/auth`):
`session` (`{bootstrapRequired, member}`), `loggedIn(member)`, `memberChanged(member)`,
`loggedOut()`. Screens report what happened and let the guard redirect: `LoginPage` calls
`loggedIn()` and does not navigate itself. `ResetPasswordPage` and `InvitePage` navigate to `/`
after `loggedIn()`. `/setup` and `/invite/:token` share `RegistrationForm`.

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

## Data access

Each data feature has one hook that is its only data access. Components never call `api` or the
`*Api.ts` files:

- `useChildren()` → `{load, retry, save(id, details), remove(id)}`; `newChildId()` uses
  `crypto.randomUUID()`. The «Новый ребёнок» sheet gets its id once when it opens, so a retried save repeats the same
  `PUT`. `save` replaces the whole Child (the API's `PUT`).
- `useChildFields()` → `{load, retry, add(id, name, valueType), rename(field, name),
  move(field, to), remove(field)}`; `newChildFieldId()` makes the id once when the «Новое поле»
  sheet opens, so a retried save repeats the same `PUT`. `move` takes the field's index after the
  move; `positionAfterMove(fields, id, to)` gives it the midpoint between its new neighbours, or
  one past either end, and only that field is written. A new field goes one past the last.
  Ordering is `position`, then id, as on the server.
- `useMembers()` → `{load, retry, replaced}`.
- `load` is `{status: 'loading'} | {status: 'failed', error} | {status: 'ready', value}`. Lists
  load from the server each time Settings opens; meanwhile each section shows a `LoadingRow`. Writes reject with `ApiError` and leave the list
  unchanged.

The load / failed / retry part is shared: `useLoad(fetch, key?)` from `@/shared/load` returns
`{load, retry, update}`. It fetches on mount and when `key` changes, drops answers that arrive
after unmounting, and `update(change)` edits the loaded value after a write. `useMembers`,
`useChildren`, `useChildFields`, `InvitesSettings` and `AuthGuard` use it, and
`features/auth/useLinkCheck` builds the Invite and password reset link check on it. Components of
Children and Child fields still go only through `useChildren()` / `useChildFields()`; `useLoad` is
an implementation detail of those hooks, so M2 can replace it there.

Children and Child fields are online-only REST in M1, a planned exception to S4. M2 swaps
`useChildren()` / `useChildFields()` onto the local store + Outbox without touching components
(see [`sync.md`](sync.md)). Auth, Invites and Member account changes stay online-only REST
permanently (S4 exception).

`crypto.randomUUID()` needs a secure context: HTTPS, or `localhost` in development.

Invites (`members/InvitesSettings.tsx`, used by `MembersSettings`): `useInvites()` loads the
active Invites once for both sections. `useInviteAdult()` gives «Взрослые» its «Пригласить
взрослого…» row: one tap sends `POST /api/invites` and, in the same tick (Safari keeps the user
activation only that long), calls `navigator.clipboard.write([new ClipboardItem({'text/plain':
blobPromise})])` with the link still pending. Copied → «Ссылка скопирована» (`status`) in the
footer for `COPIED_MS` (3 s). Not copied (refused, or no `ClipboardItem`) → a «Новая ссылка» row
with the full link and «Скопировать» (`clipboard.writeText` on a fresh tap); if that fails too the
footer asks to copy by hand. `navigator.share` is not used. `InvitesSection` («Приглашения»,
hidden when there are none) lists them as `EditableRow`s «Ссылка · до 14 ноября», revoked from
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
  No such key exists yet; the first one arrives with M2/M3 messages. The choice itself is asked
  as «Пол» with «Мужской» / «Женский» (keys `grammaticalGender.label`, `.masculine`,
  `.feminine`; nothing pre-selected): a `SegmentedControl` at registration and in
  «Ваш профиль».
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
  `AppShell`; the auth screens as `CenteredPage` (app icon, title, 400px column centred both ways).
- Offline indicator: a crossed globe in the `Page` nav bar's trailing slot while
  `useServerReachable()` is `false`. Each mounted `Page` registers its nav bar with `AppShell`;
  with none (auth screens, the start-up error in `AuthGuard`) `AppShell` shows the globe in the
  same top-right spot. `AppShell` also holds the `role="status"` message announcing «Нет связи с
  сервером» / «Связь с сервером восстановлена». Nothing is disabled offline; saves fail with their
  usual message. M2 changes its meaning to "changes will sync later".
- Settings «Оформление» (`features/settings/AppearanceSection`, `themeChoice.ts`) writes the
  choice to `localStorage` `theme` (removes it for «Авто») and dispatches
  `new StorageEvent('storage', {key: 'theme'})`, so the theme script applies it at once.

## Settings

`/settings` is one `Page` of `GroupedSection`s (in `Sections`), back to «Семья»: «Взрослые» (a
row per Member: initial, name, email, «(вы)» on the own one; not tappable; then «Пригласить
взрослого…»), «Приглашения» (an edit-mode list, see Invites above), «Ваш профиль» (Имя as an auto-saved `InputRow`, «Пол» as an auto-saved
`SegmentedControl`; each change `PATCH`es only its own field and updates the session and the
Members list; then the «Изменить пароль» chevron row), «Дети» (below), «Поля профиля» (below),
«Оформление», and the red «Выйти» row (`LogoutSection` from `features/auth`, confirmed with an
`ActionSheet`; after logging out the guard shows `/login`). Auto-save and its failure footer are
the `shared/ui` hooks `useAutoSaveText`, `useAutoSaveChoice` and `autoSaveMessages` (see
`design.md`).

The password screen `/settings/password` (`PasswordPage`, `PASSWORD_PATH` from
`features/members`) is a `Page` «Изменить пароль», back to «Настройки»: «Текущий пароль» and
«Новый пароль» as `InputRow`s in a `Form`, «Готово» in the nav bar's trailing slot, enabled once
both are filled. Enter does the same as «Готово»; Esc (the `Form`'s `onCancel`) and the back
button go to Settings without saving. On success it navigates to Settings with
`state.passwordChanged`, and «Ваш профиль» shows «Пароль изменён» in its footer
(`usePasswordJustChanged()`, which then clears the flag from the history entry so browser-back doesn't show it again); on failure the message goes in the footer under the fields (a wrong
current password empties that field). `app/routes.tsx` passes `SETTINGS_PATH` in as
`settingsPath`, since `settings` already imports `members`.

«Дети» (`ChildrenSettings`) is an edit-mode list of `EditableRow`s: the Child's colour
(`Swatch`), name, age on the right («7 лет», «5 месяцев» under a year, nothing without a birthday
or before it; `i18n` plurals `children.age.years_*` / `months_*`, computed from the device's
date) and a chevron to `/settings/children/:id` (`childPath(id)`). Edit mode deletes only
(Children have no order); a swipe and right-click delete too; each asks first. «Добавить ребёнка»
(the section's `after` row) opens `NewChildSheet`: a `Sheet` «Новый ребёнок» with the same rows
as the Child screen (`ChildRows`), name and colour required, saved only with «Готово»; on success
the Child appears in the list in the API's order. With no Children the footer says «Детей пока
нет».

«Поля профиля» (`ChildFieldsSettings`) is an edit-mode list of `EditableRow`s inside a
`SortableList`: each row's name is a text field (`input`, `useAutoSaveText`, named «Название поля
«Вес»»; empty is refused without a request) that renames the field in place on blur or Enter,
with the value type («Текст» / «Дата») on the right; it can't be changed (ADR-0007). Each row
reports its save failure up to the section's footer (`autoSaveMessages`). Edit mode shows ⊖ and a
drag handle: dragging (mouse, touch or keyboard) calls `move(field, to)`, which `PUT`s only that
field; `SortableList` shows the new order until the save settles, so a failed move puts the rows
back and the footer shows the error. A swipe and right-click delete too; every delete asks
(«Удалить поле „Вес“?»), and a failed one leaves the list as it was with the error in the footer.
«Добавить поле» opens `NewChildFieldSheet`: a `Sheet` «Новое поле» with «Название» (`InputRow`)
and «Тип» (`SegmentedControl` «Текст» / «Дата», «Текст» chosen), saved only with «Готово»; the
field goes to the end. With no fields the footer says «Полей пока нет».

The Child screen `/settings/children/:id` (`ChildPage`, `CHILD_PATH`; `app/routes.tsx` passes
`settingsPath` as for the password screen) is a `Page` titled with the Child's name, back to
«Настройки». It loads through `useChildren()` like the list (so a deep link works) and shows
`ChildRows`: Имя (`InputRow`, `useAutoSaveText`; empty is refused without a request), Цвет
(`ColorChoice`, `useAutoSaveChoice`), День рождения (`DateRow`, `useAutoSaveText` with `''` for
none). Each change `PUT`s the whole Child on top of what was last saved. Then a red «Удалить
ребёнка» row: the `ActionSheet` «Удалить „Маша“?», then back to Settings (replacing the history
entry); a failure stays and shows in that group's footer. An unknown id shows «Такого ребёнка
нет: возможно, его удалили.».

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
- Every `renderApp` test must mock `GET /api/auth/session` (`sessionHandler({...}).handler`; its
  `calls` counts requests). Every test that renders `/settings` must also mock `/api/members`,
  `/api/children`, `/api/child-fields` and `/api/invites`.
- Fixtures in `@/test/fixtures`: Members `anna`, `boris`; Children `masha`, `petya`; Child fields
  `weight`, `height`; handlers `membersHandler`, `childrenHandler`, `childFieldsHandler`,
  `invitesHandler`, `sessionHandler`.
- Query by role and label; assert on the Russian text the user sees (T1). Set
  `document.cookie = 'XSRF-TOKEN=…'` to check the CSRF header.
- To test copying, stub `ClipboardItem` (`vi.stubGlobal`) and `navigator.clipboard` (`write`,
  `writeText`) after `userEvent.setup()`, which installs its own clipboard (`invites.test.tsx`).
- Right-click: `user.pointer({keys: '[MouseRight]', target})`, then the `menuitem`. jsdom has no
  `matchMedia`, so `RowContextMenu` treats the pointer as fine there. Swipes can't be tested in
  jsdom (screenshots instead).
