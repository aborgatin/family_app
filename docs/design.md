# Design

The design brief every screen follows (ADR-0008, spec #35). The look is iOS, in the style of the
iPhone Settings app; the Mac gets the same screens, adapted inside the components. Screens are
built only from `web/src/shared/ui`; a new look is added there first, with a section here.

Code: tokens and base styles in `web/src/shared/ui/theme.css`, the theme script in
`web/index.html`, components in `web/src/shared/ui/`. Architecture: [`frontend.md`](architecture/frontend.md).

## Tokens

Tailwind CSS v4 with the tokens as CSS variables (`@theme` in `theme.css`). Tailwind's own palette,
type scale and fonts are switched off, so only these exist: a colour is `bg-<token>` /
`text-<token>` / `border-<token>`, a size is `text-<size>`. Components never write `dark:`; the
dark theme redefines the same variables.

| Token             | Light            | Dark             | Use                                        |
| ----------------- | ---------------- | ---------------- | ------------------------------------------ |
| `accent`          | `#0062CC`        | `#0A84FF`        | only things you can act on                 |
| `accent-fill`     | `#0062CC`        | `#0071E3`        | background of a filled (primary) button    |
| `on-accent`       | `#FFFFFF`        | `#FFFFFF`        | text on `accent-fill`                      |
| `background`      | `#F2F2F7`        | `#000000`        | grouped page background                    |
| `cell`            | `#FFFFFF`        | `#1C1C1E`        | grouped cells                              |
| `cell-pressed`    | `#D1D1D6`        | `#2C2C2E`        | a cell while pressed                       |
| `label`           | `#000000`        | `#FFFFFF`        | text                                       |
| `secondary-label` | `#6D6D72`        | `#98989F`        | values, hints, section headers, footers    |
| `tertiary-label`  | `#C4C4C7`        | `#5A5A5F`        | chevrons and other non-text decoration     |
| `separator`       | `#C6C6C8`        | `#38383A`        | hairlines between cells, under the nav bar |
| `fill`            | `#E3E3E8`        | `#2C2C2E`        | segmented control track                    |
| `segment`         | `#FFFFFF`        | `#636366`        | the selected segment on `fill`             |
| `bar`             | `#F2F2F7` at 80% | `#161617` at 80% | the nav bar once content is under it       |
| `destructive`     | `#D70015`        | `#FF453A`        | delete, log out, errors                    |
| `overlay`         | black at 35%     | black at 55%     | the dimmed page behind an action sheet     |

Contrast is WCAG AA (4.5:1 for text) on both `background` and `cell`; the figures are in the header
of `theme.css`. Two deliberate departures from the iOS values: light destructive text is `#D70015`
(iOS `#FF3B30` is 3.5:1 on white), and in dark the filled button is `#0071E3` (white on `#0A84FF`
is 3.7:1). The accent is never used for decoration, so it doesn't compete with the Child colours.

The app icon (`web/public/icon.svg`) is the house in `accent`; maskable and Apple icons are padded
on white. Manifest `theme_color` / `background_color` are the light `background`.

## Type

The system font stack (`-apple-system, system-ui, …`: SF on Apple devices), no web fonts, no
Dynamic Type. The iOS scale in `rem`:

| Token         | Size | Use                                                                                   |
| ------------- | ---- | ------------------------------------------------------------------------------------- |
| `large-title` | 34   | the screen title (bold)                                                               |
| `title3`      | 20   | rare emphasis                                                                         |
| `body`        | 17   | everything by default; `font-semibold` = iOS headline (nav bar title, primary button) |
| `subhead`     | 15   | secondary lines in a row (e.g. an email under a name)                                 |
| `footnote`    | 13   | section headers (uppercase) and footers                                               |
| `caption`     | 12   | badges                                                                                |

## Theme

Light and dark. The default, «Авто», follows the system. A per-device choice is stored in
`localStorage` under `theme`: `"light"`, `"dark"`, or absent / anything else for «Авто» (the
switch is in Settings «Оформление»). The inline script in `web/index.html` runs before React
starts, so the wrong theme never flashes: it sets `<html data-theme="light|dark">` and the
`theme-color` meta (`#F2F2F7` / `#000000`), and re-applies when the system theme changes or on a
`storage` event. After changing the stored choice, dispatch
`new StorageEvent('storage', { key: 'theme' })` on `window` to apply it in the same window.

The status bar is `black-translucent`: the page draws under it, and the nav bar pads by
`safe-area-inset-top`. The page bottom pads by `safe-area-inset-bottom`, the sides by
`safe-area-inset-left/right`.

## Rules every component follows

- **Touch vs pointer.** With a coarse pointer (`pointer-coarse:`) every target is at least 44×44px.
  With a fine pointer (`pointer-fine:`) spacing is tighter (28px targets for text buttons). Hover
  styles exist only where the device can hover (Tailwind's `hover:` already checks
  `(hover: hover)`).
- **Narrow vs wide.** Content sits in a column at most 640px (`max-w-160`) centred in the window;
  on a phone that is the full width minus 16px margins. Overlays: an action sheet on narrow
  windows, a centred dialog on wide ones.
- **Keyboard.** Everything is reachable with Tab, in reading order. Focus is always visible
  (`focus-visible:` 2px accent outline, offset 2px). Enter saves or confirms, Esc cancels or
  closes.
- **Motion.** No slide between screens; sheets slide up. With `prefers-reduced-motion` all
  animations and transitions are off (global rule in `theme.css`).
- **Text and names.** Every string, including `aria-label`, comes from the i18n file (I2). Icon-only
  controls take a translated `label`, which is their accessible name.

## Saving and deleting

- **Auto-save** for editing what exists: text saves on blur or Enter, a choice saves on tap. Esc
  puts the saved value back. A spinner appears at the right of the row only after ~400 ms. No
  success toast or checkmark.
- **On failure** the typed value stays; a red message goes in the group footer under the row
  («Не удалось сохранить. Проверьте соединение.») with «Повторить». A validation error (e.g. empty
  name) shows there and sends nothing. A failed choice goes back to the previous value with the
  same message. Messages come from `errorMessage()` (I3).
- How: `useAutoSaveText()` / `useAutoSaveChoice()` from `shared/ui` hold all of this. A screen
  gives them the row's `name`, the saved value and a `save(value)` that resolves with the value
  as saved; spreads `input` onto an `InputRow` / `control` onto a `SegmentedControl`; and passes
  `messages={autoSaveMessages([a.failure, b.failure])}` to the `GroupedSection`. Those footer
  lines are about their rows, announced (`alert`), and carry «Повторить»; rows that failed for
  the same reason share one line, whose «Повторить» retries them all. No screen writes its own
  saving state.
- **Explicit confirm** only for: auth forms (full-width primary button), creating something
  (a «Новый …» sheet with «Отмена» / «Готово», so a half-filled item is never saved), and the
  password screen («Готово» in the nav bar).
- **Deleting always asks**, with an action sheet («Удалить „Маша“?» / «Удалить» / «Отменить»),
  whether it starts from a swipe, edit mode ⊖, right-click or a «Удалить …» row. A full swipe only
  reveals «Удалить».

## Components

All in `web/src/shared/ui`, exported from its `index.ts`.

### AppShell

The layout route around every screen (`app/routes.tsx`). One content pane today; M2's two-pane
layout adds a sidebar next to it here, so screens don't change. Screens never use it directly.

### Page

Every logged-in screen is one `Page`: `title`, optional `back` (`{to, title}` of the previous
screen) and `actions` (the nav bar's trailing slot), then the content.

- The nav bar is sticky. At the top it is transparent; once content scrolls under it, it turns
  translucent (`bar` + backdrop blur) with a hairline. The large title (`h1`) scrolls away with the
  content; when it has gone under the bar, the small centred title fades in.
- Back button: a chevron and the previous screen's title, left. Actions: icon `Button`s or `Link`s,
  right.
- Narrow: full width with 16px margins. Wide: the bar spans the window, its contents and the page
  sit in the 640px column.
- Keyboard: the bar comes first in tab order (back, then actions), then the content.

### Button

Does something. `variant`: `plain` (accent text, default), `destructive` (red text), `primary`
(filled, full width, for the one confirm action of an auth form). Text, an icon before text
(`icon`), or an icon alone with a translated `label`. `type="submit"` inside a form.
`size="small"`: footnote-sized, for a section footer («Повторить»); it keeps its touch target
without pushing the lines apart. Touch: 44px target; primary is 50px tall. Fine pointer: 28px (primary 36px). Hover dims it; disabled is 40%
opacity.

### Link

Goes to another screen (`to`). Looks like the `Button` of the same `variant`, and takes the same
content (text, icon + text, or icon + `label`). Use `Button` when it does anything besides
navigating.

### Icon

`<Icon name="settings" />`. Wraps `lucide-react`; features never import lucide. Names: `back`,
`chevron`, `home`, `minus` (edit mode's ⊖), `offline` (crossed globe), `settings`, `spinner`; a new icon is added to the
map in `Icon.tsx`. Decorative (`aria-hidden`) unless given a `label`. Takes the current text
colour; default size 22px.

### EmptyState

A centred quiet message where a screen or list has nothing yet: optional large `icon`, the text,
an optional `action` under it (e.g. «Повторить»). `compact` drops its vertical padding inside a
`CenteredPage`. Same on every device.

### OfflineIndicator

A crossed globe (`secondary-label`) shown while the server can't be reached: after any request
fails with `network.unavailable`, until the next request gets an answer. Screens never place it:
`Page` puts it first in the nav bar's trailing slot, and on screens without a nav bar (auth
screens) `AppShell` shows it in the same top-right spot of the 640px column. It disables nothing.

- Tap (or click) toggles a small popover «Нет связи с сервером» under it; Esc or a tap elsewhere
  closes it. With a mouse, hovering shows it too.
- Touch: 44px target. Fine pointer: 28px.
- Its accessible name is «Нет связи с сервером»; a visually hidden `role="status"` in `AppShell`
  announces going offline and «Связь с сервером восстановлена».
- Keyboard: reachable with Tab after the back button; Enter/Space opens the popover, Esc closes
  it. Focus stays on the globe.

### CenteredPage

A screen outside the app's navigation: `/setup`, `/login`, `/invite/:token`,
`/reset-password/:token`. The app icon (`/icon.svg` on a `cell` tile), the large `title`
centred under it, an optional `intro` in `secondary-label`, then the content. No nav bar. The
column is at most 400px (`max-w-100`) and centred both ways in the window; on a phone it is the
full width minus 16px margins and the safe areas. A screen waiting for something or showing a
failure (the link check: «Проверяем ссылку…», a broken link, «Повторить») keeps the same layout
and shows a `compact` `EmptyState` with `role` instead of the form.

### Form

Wraps the fields and the primary `Button` (`type="submit"`) of a screen with an explicit confirm
(the auth forms). `onSubmit` runs on Enter in any field and on the button; the browser's own
validation bubbles are off, the screen puts its messages in the group footer. Sections and the
button are 24px apart. Not for auto-saved rows: they save themselves.

### GroupedSection

A grouped inset list, as in the iPhone Settings app: optional `header` (footnote, uppercase,
`secondary-label`), the rows on one `cell` with rounded corners and inset hairlines between them,
and a footer. Rows share a two-column grid, so inline labels line up and values start at one
edge. Use it for every group of rows; a screen is a stack of them.

The footer is `messages`: lines top to bottom, each `{text, tone, row}`. `tone: 'error'` is red,
`hint` (default) is `secondary-label`. A line with `row` (a row's `name`) is that row's
accessible description; an error also marks the row invalid (`aria-invalid`, label in red). An
error without `row` is about the whole group (a failed submit) and is announced (`role="alert"`).
Show a row's error instead of its hint, not under it. Messages come from the error-code mapping
(I3). Same on every device. Further, optional: `row` may name several rows; `announce` makes a
row's error an `alert` too (a save that failed after the field was left), and a hint a `status`
(«Ссылка скопирована», shown for a few seconds); `action` adds a small
text `Button` after the line («Повторить»). A `header` also names the section (a region).

With `edit` (`{editing, onEditingChange}`) the group is an **edit-mode list**: «Изменить» /
«Готово» (a small `Button`) at the right of the header turns edit mode on and off, the cell is a
`list` named by the header, and its rows are `EditableRow`s. Leave edit mode when the last row
goes. Same on every device; on touch it is how you delete besides swiping, with a fine pointer
besides right-click, and with the keyboard the only way.

Content that isn't rows yet (the M1 parts of Settings until their tickets) goes in one
`SectionContent`, a padded cell spanning the group.

### Sections

A screen made of `GroupedSection`s stacks them in `Sections`: 32px apart on touch, 24px with a
fine pointer.

### InputRow

A text field as a row of a `GroupedSection`: `label` inline at the left, the field filling the
rest (`type` text, email or password; `autoComplete`). Its `name` links it to footer messages.
Touch: 44px row, the caret is the only focus sign, as on iOS. Fine pointer: 36px row, and the
focused field gets the accent outline. Enter submits the surrounding `Form`, unless the row
auto-saves: with `onCommit` (from `useAutoSaveText()`), leaving the field or Enter saves, Esc
(`onRevert`) puts the saved value back, and `busy` shows the `Spinner` at the right of the row.

### SegmentedControl

One of two or three choices, as an iOS segmented control in a row of a `GroupedSection`:
`label` at the left, the segments at the right on the `fill` track, the chosen one on `segment`.
`value` may be `undefined`: nothing is selected (e.g. «Пол» at registration). Built from radios
(`role="radiogroup"` named by the label): Tab reaches it, arrow keys move the choice, Space picks.
Touch: 32px segments drawn in a 48px row, each segment's target reaching the row's top and
bottom edges (48px tall). Fine pointer: 24px segments. Its `name` links it to footer messages like an `InputRow`.
Auto-saved (`useAutoSaveChoice()`): each choice saves at once, so arrow keys save on every move;
`busy` shows the `Spinner` after the label.

### ListRow

A row of a `GroupedSection` that isn't a field: `title`, optional `subtitle` (second, smaller line), `leading` (an
`Avatar`, a colour dot; centred in an avatar-wide slot, and the hairline above the row then starts
at the text, as on iOS), `value` (right-aligned, secondary colour), `busy` (spinner). What it does
decides what it is:

- `to`: opens another screen, chevron on the right (a link);
- `onClick`: a button row; with `destructive` red text («Выйти», «Удалить …»), with `accent`
  accent text for a row that adds something («Пригласить взрослого…», «Добавить ребёнка»);
- neither: shows something, not tappable (the «Взрослые» rows).

Touch: at least 44px tall, grey while pressed. Fine pointer: 36px, hover tint. Keyboard: tappable rows take focus (accent outline inside the cell),
Enter / Space activate them.

`wrapSubtitle` shows the whole subtitle, wrapped, instead of cutting it with «…» (a link to copy
by hand). A `Button` can go in `value` (the «Скопировать» of a link that wasn't copied).

### EditableRow

A row of an edit-mode list (`GroupedSection` with `edit`) that can be deleted: `title` (a string:
it also names ⊖), `subtitle`, `leading`, `value`, `busy` as a `ListRow`, optional `to` (opens a
screen, chevron; not in edit mode), `confirm` (`{title, message}` of the action sheet) and
`onDelete`, which runs only after the action sheet's «Удалить». Every way in asks first:

- **Edit mode**: a red ⊖ at the left, a button named «Удалить «<title>»» (Tab reaches it,
  Enter / Space presses it). `handle` is shown at the right: the drag handle of a list that can
  be reordered (Child fields: the sortable list around the rows passes its `ref` and the handle).
  Swipe and right-click are off.
- **Touch**: `SwipeToDelete` (below).
- **Fine pointer**: `RowContextMenu` with «Удалить» (below).

Children use it for delete only (`to` their screen), Child fields with `handle`, Invites plain.

### SwipeToDelete

Inside `EditableRow`; use it directly only for a row that isn't one. Swipe a row left on a touch
screen and a red «Удалить» slides in from the right (88px). A full swipe only reveals it:
deleting is a separate tap, which then asks. Swiping right, tapping the row or tapping anywhere
else closes it; edit mode closes it too. A vertical move scrolls the page as usual. Touch only
(`pointerType === 'touch'`): mouse and pen never move the row. Not reachable by keyboard (edit
mode is).

### RowContextMenu

Inside `EditableRow`. Right-click (or the context-menu key / Shift+F10) on a row opens a small
menu next to the pointer: «Удалить» in red. Fine pointer only: on a touch screen a long press does
nothing (the row is swiped there). Keyboard: arrows move, Enter picks, Esc closes. Built on Radix
Context Menu (non-modal, so the action sheet can open from it).

### Avatar

The grey circle with a name's initial, as `leading` of a row about a person. Decorative.

### ActionSheet

Asks before something that can't be undone: `title` (the question), optional `message`,
`actions` (usually one `destructive`), and «Отменить» added last. Narrow windows (< 640px): an
iOS action sheet sliding up from the bottom, «Отменить» in its own block. Wide windows: a centred
dialog, «Отменить» its last line. Built on Radix Dialog: focus moves in and back to the trigger,
Esc or a tap outside cancels.

### Spinner

«Сохраняем…» at the right of a row while it saves; rows show it through `busy`, which the
auto-save hooks set only after ~400 ms.

### TextField, GrammaticalGenderChoice

Still the M1 form controls inside the parts of Settings that keep their M1 content (Invites,
password, Children, Child fields) until their own tickets of spec #35.
