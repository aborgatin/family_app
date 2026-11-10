# Screenshots

`scripts/screenshot.sh` shoots the web app from this checkout at **390×844 touch** (2× scale) and
**1280×800 mouse**, each in **light and dark**: four PNGs per route. It is how a UI change shows
what jsdom can't check (layout, touch vs pointer, narrow vs wide, theme). It doesn't run in CI.

```sh
scripts/screenshot.sh --out <dir>                    # every route in screens.mjs
scripts/screenshot.sh --out <dir> --only home,child  # just these
```

| Option | Default | Meaning |
|---|---|---|
| `--out <dir>` | required | where the PNGs, `results.json` and `_logs/` go |
| `--only a,b` | all | route names to shoot |
| `--config <file>` | `screens.mjs` | a `.mjs` (`export default {routes}`) or `.json` screens file |
| `--worktree <path>` | this checkout | the checkout to build and run |
| `--variants …` | all four | `mobile-light`, `mobile-dark`, `desktop-light`, `desktop-dark` |
| `--skip-build` | off | reuse `backend/build/libs/*.jar` instead of `./gradlew bootJar` |

Output is `<route>--<variant>.png`. `results.json` has each shot's final URL, step errors and
console errors; the exit code is 1 if any step failed. View a PNG with the Read tool. Several runs
from different checkouts can run at once: every service gets a free port and its own container.

## What a run starts and seeds

A fresh `postgres:18` container, the backend jar, and Vite, all torn down at the end (also on
Ctrl-C). Then it seeds through the real API:

- **Анна** `anna@example.com` / `password123`, logged in for every route unless `auth` says
  otherwise; **Борис**, who joined through an Invite.
- Children **Маша** (coral, born 2019-04-12), **Петя** (blue, no birthday), **Соня** (green,
  2022-09-01). Child fields: the Defaults (Вес, Рост) plus «Размер обуви» (text) and «Последний
  визит к врачу» (date). Маша has a value for each of them («Размер обуви» saved twice); Петя and
  Соня have none.
- Lists: Анна's «Супермаркет» (Покупки, three open Items, «Хлеб бородинский» with a Description
  ending in a link, and two Done), «Аптека» (Покупки) — both the Default Shopping lists the
  bootstrap created, filled by the seed, with Супермаркет's Default Categories deleted so it stays
  a list without Categories — «Гипермаркет» (Покупки with Categories
  «Еда» (two open, «Молоко» with a Description, one Done), «Бытовая химия» (empty), then the
  Unnamed category with one Item; three more Items added and cleared, so its Item history has
  names no Item shows),
  «Ремонт» (TODO, Private), «Дела по дому» (TODO, two open, one with a Description, and four Done: today, 6, 8 and 40 days ago, so two are in «Выполненные ранее»), «Подарки»
  (Желания, one open and one Done), «Книги» (Желания); Борис's «Гараж» (TODO) and his
  Private «Подарок Анне», which Анна never sees. The Lists without Items show the empty states.
- Child lists, on Маша's Child page only (never on Home): «Школа» (TODO, two open Items and one
  Done) and «Желания» (Желания, one Item). Петя and Соня have none.
- One active Invite.

Browser context: installed Google Chrome (`SHOOT_CHANNEL` to override), locale `ru-RU`,
`Europe/Berlin`, reduced motion, service workers blocked, clipboard permissions granted.

## Routes

`screens.mjs` holds every screen and state of the app. When a change adds or alters a screen, add
or update its route there, so the next change shoots it too. A route has:

- `name`, `path`. In the path, `{inviteToken}` is the active Invite's token and `{resetToken}` a
  password reset token made with the backend's `reset-password` command.
- `auth`: `member` (default), `loggedOut`, or `fresh` (before anything is seeded, for `/setup`;
  with `isolate: true` each variant starts from an empty database, so its steps may register the
  first Member, as `home-defaults` does).
- `isolate: true` for a route that changes data (creates, deletes, saves): each of its variants
  starts from a freshly seeded database, so the four shots match and later routes see the seed.
- `offline`: `start` (API requests fail from the first one) or `afterLoad` (the page loads, then
  they fail and the browser goes offline, then the steps run).
- `localStorage`: `{key: value}` set before the app starts, e.g. `{theme: 'dark'}`.
- `initScript`: JS run before the app's own code; `helpers.mjs` has `hang(part)` (a request that
  never answers), `noLists` (pulls answer without Lists: Home's empty state), `onlyChildren(…names)`
  (pulls answer with only those Children; none: no Children), `noChildFields` (pulls answer
  without Child fields) and `failClipboard`.
- `fullPage`: default `true`; `false` shoots the viewport only (sheets, dialogs, scrolled states).
- `steps`, run in order: `{click: sel}`, `{tap: sel}`, `{fill: sel, value}`, `{press: 'Enter'}`,
  `{hover: sel}`, `{waitFor: sel}`, `{scroll: sel}`, `{wait: ms}`, `{eval: 'js'}`, or in a `.mjs`
  file `async (page, ctx) => {}` with `ctx.hasTouch` etc. `helpers.mjs` has `editIn(section)`,
  `toSection(section, by)`, `rowActions(section)` (swipe on touch, right-click on mouse) and
  `slowPut(prefix, ms)`.

Selectors are Playwright's, by role and Russian name like the tests:
`role=button[name="Добавить ребёнка"]`, `role=region[name="Дети"] >> role=listitem >> nth=0`.

## Gotchas

- The app runs on `http://localhost:<port>`, not `127.0.0.1`: the backend's cookies are `Secure`,
  which browsers allow on `localhost` only.
- Offline blocks paths starting with `/api/` only. A glob like `**/api/**` also blocks Vite's
  source modules under `/src/shared/api/`, and the page comes out blank.
- A segmented control's radios are visually hidden: click the segment's visible label
  (`role=dialog >> text=Дата`), not the radio.
- Settings has several «Имя» fields: scope the selector to a section or a dialog.
- Native date inputs show the date in the Mac's own region format (`12/04/2019` on an English
  Mac), whatever the page's locale: Chrome on macOS takes it from the system, and neither
  `--lang` nor `LANG` changes it. A Russian iPhone shows `12.04.2019`; that isn't an app bug.
