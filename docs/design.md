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
dark theme redefines the same variables. A colour written into code instead (a hex, `rgb(…)` or
`color-mix(…)` in a class or style) is a lint error: it would have no dark value. A new colour is
a new token here, with its light and dark values.

| Token              | Light            | Dark             | Use                                        |
| ------------------ | ---------------- | ---------------- | ------------------------------------------ |
| `accent`           | `#0062CC`        | `#0A84FF`        | only things you can act on                 |
| `accent-fill`      | `#0062CC`        | `#0071E3`        | background of a filled (primary) button    |
| `on-accent`        | `#FFFFFF`        | `#FFFFFF`        | text on `accent-fill`                      |
| `background`       | `#F2F2F7`        | `#000000`        | grouped page background                    |
| `cell`             | `#FFFFFF`        | `#1C1C1E`        | grouped cells                              |
| `cell-pressed`     | `#D1D1D6`        | `#2C2C2E`        | a cell while pressed                       |
| `label`            | `#000000`        | `#FFFFFF`        | text                                       |
| `secondary-label`  | `#6D6D72`        | `#98989F`        | values, hints, section headers, footers    |
| `tertiary-label`   | `#C4C4C7`        | `#5A5A5F`        | chevrons and other non-text decoration     |
| `separator`        | `#C6C6C8`        | `#38383A`        | hairlines between cells, under the nav bar |
| `fill`             | `#E3E3E8`        | `#2C2C2E`        | segmented control track                    |
| `segment`          | `#FFFFFF`        | `#636366`        | the selected segment on `fill`             |
| `bar`              | `#F2F2F7` at 80% | `#161617` at 80% | the nav bar once content is under it       |
| `destructive`      | `#D70015`        | `#FF453A`        | delete, log out, errors                    |
| `destructive-fill` | `#D70015`        | `#E0262B`        | background of the swipe «Удалить» button   |
| `overlay`          | black at 35%     | black at 55%     | the dimmed page behind an action sheet     |
| `swatch-edge`      | black at 12%     | white at 18%     | hairline around a colour dot (`Swatch`)    |
| `check-shadow`     | black at 50%     | black at 50%     | keeps the white check on a colour readable |

Contrast is WCAG AA (4.5:1 for text) in both themes, checked by `shared/ui/theme.test.ts` for every
text/background pair; a new token that carries text or sits under it gets its pair there. Three
deliberate departures from the iOS values: light destructive text is `#D70015` (iOS `#FF3B30` is
3.5:1 on white), in dark the filled button is `#0071E3` (white on `#0A84FF` is 3.7:1), and the swipe
«Удалить» in dark is `#E0262B` (white on `#FF453A` is 3.4:1). The accent is never used for decoration, so it doesn't compete with the Child colours.

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
`safe-area-inset-left/right`. Components pad with the utilities in `theme.css`: `px-safe-<n>`
(the side inset, but at least spacing `n`), `pt-safe-<n>` / `pb-safe-<n>` (the inset plus
spacing `n`).

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
  puts the saved value back. When the saved value changes from elsewhere (a pull, or the server's
  copy after a rejected change), a row the Member isn't editing shows it. A spinner appears at the right of the row only after ~400 ms. No
  success toast or checkmark.
- **On failure** the typed value stays; a red message goes in the group footer under the row
  («Не удалось сохранить. Проверьте соединение.») with «Повторить». A change the server rejected later,
  after the sync push, is not a footer line: the screen may be gone by then, so a `Toast` says
  «Не удалось сохранить» once, wherever the Member is. A validation error (an empty
  name, with `required` on `useAutoSaveText()`) shows there and sends nothing. A failed choice goes back to the previous value with the
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

All in `web/src/shared/ui`, exported from its `index.ts` (except `OfflineIndicator`,
`Spinner` and `RowContextMenu`, which only other components place). Feature code uses nothing
else to draw: no raw `button` / `input` / `select` / `textarea` / `form` / `a`, no `className` or
`style`, no UI library (CODING_STANDARDS U1, enforced by lint). The auto-save hooks
`useAutoSaveText()`, `useAutoSaveChoice()` and `autoSaveMessages()` are described under
[Saving and deleting](#saving-and-deleting).

Two more hooks keep screens from writing the same state twice:

- `useFooterLines()` gives `GroupedSection` footer lines from error messages, translated:
  `failure(error, retry?)` is a red line about the group (a failed delete; with `retry`, a list
  that couldn't load, with «Повторить»); `form({fields, fieldErrors, formError, hints})` is a red
  line under each field with an error (else its hint), then the form's own failure.
- `useEditableList()` holds an edit-mode list's state: spread `edit` onto the `GroupedSection`,
  mark the row `busy` while `deleting` is its id, show `error` with `failure()`.
  `remove(id, last, run)` runs a delete (and leaves edit mode with the last row);
  `attempt(run)` reports any other change (a move) the same way.

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
  right; or the one text `Button` that confirms a screen («Готово» on the password screen),
  disabled until the screen can be confirmed.
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
`check` (the chosen colour), `chevron`, `clear` (a circled ×), `home`, `minus` (edit mode's ⊖),
`expand` (a small ⌄ on a `MenuChip`), `offline` (crossed globe), `reorder` (≡, a drag handle), `settings`, `spinner`; a new icon is added to the
map in `Icon.tsx`. Decorative (`aria-hidden`) unless given a `label`. Takes the current text
colour; default size 22px.

### EmptyState

A centred quiet message where a screen or list has nothing yet: optional large `icon`, the text,
an optional `action` under it (e.g. «Повторить»). `compact` drops its vertical padding inside a
`CenteredPage`. Same on every device.

### StatusScreen

The whole window with only a message, centred both ways in a 400px column: while the app starts,
before any screen can be shown (`AuthGuard`: «Загрузка…» while the session loads, the failure
with «Повторить» when it couldn't be loaded). `role` (`status` / `alert`), the text, an optional
`action`. No title, no nav bar; `AppShell` shows the offline globe in the corner. Same on every
device. A screen that has a title uses `CenteredPage` or `Page` with an `EmptyState` instead.

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

When the confirm is «Готово» in the nav bar (the password screen), the form holds only the fields:
Enter still calls `onSubmit` (the screen ignores it until it can be confirmed), and `onCancel`
makes Esc in a field leave the screen without saving. Same on every device.

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
row's error an `alert` too (a save that failed after the field was left), and a hint a
`role="status"` (a result to report, e.g. «Пароль изменён» under «Ваш профиль» after the password
screen, «Ссылка скопирована» for a few seconds); `action` adds a small
text `Button` after the line («Повторить»). A `header` also names the section (a region).

**Untitled group**: with no `header`, the group is just the gap above its cell (the Unnamed
category on a Shopping list); `label` names it for assistive technology only, so it is still a
region («Без категории»). **Header being typed**: `headerField` (`{label, value, onChange,
onCommit, onCancel}`) puts a text field in the header's place and look, focused when it appears,
with `label` as its placeholder and the group's name: for a group the Member has just asked for
(a new Category, «Название категории»). Enter or leaving it commits, Esc cancels; the screen
decides what an empty one means.

With `edit` (`{editing, onEditingChange}`) the group is an **edit-mode list**: «Изменить» /
«Готово» (a small `Button`) at the right of the header turns edit mode on and off, the cell is a
`list` named by the header, and its rows are `EditableRow`s. Leave edit mode when the last row
goes. Same on every device; on touch it is how you delete besides swiping, with a fine pointer
besides right-click, and with the keyboard the only way.
`action` (`{label, onClick}`) puts one more small text `Button` at the right of the header,
before «Изменить»: «Очистить» on a Shopping list's «Куплено», which asks with an `ActionSheet`
first.
`after` puts rows on the same cell after the list but outside it (an accent «Добавить …» row):
they stay when the list is empty, and the «Изменить» button is left out then (pass no `edit`).

### ColorChoice

One colour of a few (the Child color palette, 8), as a row of a `GroupedSection` in the style of
the Reminders colour picker: `label` on top, the circles in one row of 8 under it, the chosen one
ringed in its own colour with a white check. `options` are `{value, label, color}`: `label` (from
i18n) names the circle, `color` draws it; the palette itself stays in `shared/palette`. `value` may
be `undefined` (nothing chosen yet, or a code this build doesn't know). Built from radios
(`radiogroup` named by the label): Tab reaches it, arrow keys move the focus, Space, Enter or a
click picks. Its `name` links it to footer messages. Auto-saved with `useAutoSaveChoice()`
(spread `control`): each pick saves (moving the focus with the arrows doesn't), `busy` shows the
`Spinner` at the right of the row, on the label's line. Touch: each circle's target is its
column, 44px tall (about 40px wide on a phone). Fine pointer: smaller circles, the 8 kept in a
288px strip at the left instead of spread across a wide cell.

### DateRow

An optional date as a row: `label` inline at the left, the browser's own date field at the right
in a grey pill (the wheel on the iPhone, a calendar popup on the Mac; the format follows the
browser's language), and a grey ⊗ «Очистить «<label>»» after it while there is a date. `value`
is `YYYY-MM-DD` or `''`. Auto-saved like an `InputRow` (spread `input` of `useAutoSaveText()`):
leaving the field or Enter saves, Esc puts the saved date back, clearing saves at once; not on
every change, since typing a year digit by digit is a valid date at each step. Without
`onCommit` (in a `Sheet`) Enter submits. Touch: the ⊗ has a 44px target. Fine pointer: 28px.

### Sheet

Creates something with an explicit «Готово» (the «Новый ребёнок», «Новое поле» sheets): `title`
(names the dialog), `onDone`, `onOpenChange` (`false` on «Отмена» or Esc), `busy` (disables
«Готово» while saving), and the `GroupedSection`s as children. A header «Отмена» · title ·
«Готово» (semibold), the content on the grouped `background` under it. The sheet is a `form`:
Enter in a text field is «Готово». Narrow windows: slides up from the bottom and fills the
window but a strip at the top, rounded top corners. Wide windows: a centred dialog at most 540px
wide. Built on Radix Dialog: focus starts in the first field and goes back to the trigger; Esc
cancels; a click outside does nothing (it would lose what was typed). The screen owns the field
state, validates on «Готово» and shows messages in the group footer like any form; it closes the
sheet once saved. Mount it only while open (with a `key` per item being created), so it starts
empty each time.

### Swatch

A small dot in a colour (`color`, a CSS colour such as a Child color's `hex`), as `leading` of a
row. Decorative: the row names what it marks.

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
`busy` shows the `Spinner` after the label. `labelHidden` keeps the label for screen readers only
and gives the segments the whole row, for a choice whose options say it all (Visibility
«Личный» / «Общий» in «Новый список», named «Видимость»); not for auto-saved rows yet, since the
spinner sits with the label.

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

### LoadingRow

«Загрузка…» as a plain `ListRow` (announced, `role="status"`) where a `GroupedSection`'s rows
will be while its list loads («Взрослые», «Дети», «Поля профиля»). Same on every device.

### EditableRow

A row of an edit-mode list (`GroupedSection` with `edit`) that can be deleted: `title` (a string:
it also names ⊖), `subtitle`, `leading`, `value`, `busy` as a `ListRow`, optional `to` (opens a
screen, chevron; not in edit mode), `confirm` (`{title, message}` of the action sheet) and
`onDelete`, which runs only after the action sheet's «Удалить». Every way in asks first:

- **Edit mode**: a red ⊖ at the left, a button named «Удалить «<title>»» (Tab reaches it,
  Enter / Space presses it). In a `SortableList` (below) the row takes its `sortable` and shows
  the drag handle at the right. Swipe and right-click are off.
- **Touch**: `SwipeToDelete` (below).
- **Fine pointer**: `RowContextMenu` with «Удалить» (below).

`input` renames in place: out of edit mode the title is a text field (spread `input` of
`useAutoSaveText()` and add a translated `label`, its accessible name, e.g. «Название поля
«Вес»»), auto-saved like an `InputRow`: blur or Enter saves, Esc puts the saved text back, `busy`
shows the spinner, and its `name` links it to the footer messages. It looks like the title; with
a fine pointer the focused field gets the accent outline. In edit mode the row shows `title`.

`secondary` (with `input`) adds a grey secondary line under the title, in `subhead`
`secondary-label` (an Item's Description). While the row is being edited (the focus is anywhere
in it) it is a multi-line text field that grows with its text, with a `placeholder` («Описание»)
in `tertiary-label`: Enter starts a new line, blur saves, Esc puts the saved text back. Out of it a
non-empty value is one line cut with «…», its http(s) addresses links in `accent` that open in a
new tab; tapping the line beside them starts editing with the full text and the caret at the end.
Leaving the row with it empty hides it. Spread `useAutoSaveText()`'s `input` and add `label` and
`placeholder`.

`chip` (with `secondary`) adds a `MenuChip` under the secondary line while the row is being edited
(an Item's Category); the row stays edited while the chip's menu is open, and the focus goes back
to the chip when it closes.

Children use it for delete only (`to` their screen), Child fields with `input` and `sortable`,
Items with `input`, `secondary` (the Description), on a Shopping list with named Categories a
`chip` (the Category), and a `DoneToggle` as `leading` (Done Items `muted`, without `input`),
Invites plain.

`muted` (on `ListRow` and `EditableRow`) shows the title in `secondary-label`: something set
aside, like a Done Item.

### AddRow

The last row of a list that adds an entry by typing, as on paper (a List's «Новый товар»): an
empty text field showing `label` as its placeholder (secondary colour), which is also its
accessible name. Enter calls `onAdd(text)` with the trimmed text and empties the field, keeping
the focus for the next entry; leaving the field with text in it adds it too; blank text adds
nothing; Esc empties the field. Goes in a `GroupedSection`'s `after`, under an edit-mode list.
`focus` makes it take the focus when it appears (a new Category's field, once its title is
typed).
Touch: 44px row, the caret is the focus sign; fine pointer: 36px row, accent outline when focused.
Same on narrow and wide windows.
`suggest(typed)` gives names to suggest for the text typed so far: while the field is focused
and has text, they show right under it as `SuggestionRows`, and picking one adds it (`onAdd`)
instead of the typed text, empties the field and keeps the focus there. Tab moves from the field
to the suggestions without adding anything; leaving both adds the typed text as usual.

### SuggestionRows

Up to 5 plain rows directly under the focused `AddRow` (it places them; a List's autocomplete
from the Item history): each a name in `label`, a hairline above every row as in any group.
Tapping or clicking a row picks it; pressing it with the mouse doesn't take the focus from the
field. A group named «Подсказки» (`ui.suggestions`); each row is a button named by its name, so
Tab reaches them after the field, Enter or Space picks. Touch: 44px rows; fine pointer: 36px,
hover tint. Same on narrow and wide windows.

### DoneToggle

The circle at the left of a row that ticks it off, as in iOS Reminders; goes in a row's
`leading`. Open: an empty ring, 1.5px `secondary-label` (3:1 or more on `cell`, so it reads as a
control); Done: a filled `accent-fill` circle with an `on-accent` check. A checkbox
(`role="checkbox"`, `aria-checked`) whose accessible name is the translated `label`, saying what
it marks («Куплено «Молоко»»); `onChange(done)` gets the new state. Tap, click, Space or Enter
toggles it; focus shows the accent outline. Touch: 44×44 target around a 22px circle; fine
pointer: 28×28 around 20px. Same on narrow and wide windows. Used by the List screen's Items.

### SortableList

The rows of an edit-mode list that can be reordered (Child fields), on dnd-kit (used nowhere else):
`items` in order, `itemId`, `itemTitle` (names the handle «Переместить «<title>»» and the
announcements), `onMove(item, to)` with the index after the move, and a render function that gets
each item and its `sortable` for an `EditableRow`. Goes inside a `GroupedSection` with `edit`,
adding no element of its own. In edit mode each row has a grey ≡ drag handle at the right; out of
edit mode nothing moves. The dragged row lifts (shadow) and stays inside the list; the others
make room. After a drop the list shows the new order until the promise `onMove` returns settles;
if `items` didn't change by then (the save failed), the rows go back and the screen shows the
error in the footer.

- Touch: drag the handle (44px target); the rest of the row still swipes and scrolls.
- Fine pointer: drag the handle (28px wide) with the mouse.
- Keyboard: Tab to the handle; Space or Enter picks the row up, ↑ / ↓ move it, Space or Enter puts
  it down, Esc puts it back. Screen readers get the instructions and each step in Russian
  (`ui.sortable.*`).
- Same on narrow and wide windows.

### SwipeToDelete

Inside `EditableRow`; use it directly only for a row that isn't one. Swipe a row left on a touch
screen and a red «Удалить» slides in from the right (88px). A full swipe only reveals it:
deleting is a separate tap, which then asks. Swiping right, tapping the row or tapping anywhere
else closes it; edit mode closes it too. A vertical move scrolls the page as usual. Touch only
(`pointerType === 'touch'`): mouse and pen never move the row. Not reachable by keyboard (edit
mode is).

### MenuChip

A small pill in `fill` with `footnote` text and a ⌄ (`expand`) that opens a menu of choices, the
current one ticked (✓): the Category chip under a shopping Item being edited (`EditableRow`'s
`chip`, ticket #73), «Еда ⌄», named «Категория: Еда» (`accessibleLabel`). The menu opens under
the chip, aligned to its left edge, in `cell` with a hairline border, rows in `body`; a `muted`
choice is `secondary-label` («Без категории»), the highlighted one `accent` with white text.
Picking calls the choice's `onSelect`. Tap, click, Enter or Space opens it; arrows move, Enter
picks, Esc closes and the focus goes back to the chip. Touch: 28px chip, 44px menu rows; fine
pointer: compact rows. Built on Radix DropdownMenu (non-modal, a radio group).

### RowContextMenu

Inside `EditableRow`. Right-click (or the context-menu key / Shift+F10) on a row opens a small
menu next to the pointer: «Удалить» in red. Fine pointer only: on a touch screen a long press does
nothing (the row is swiped there). Keyboard: arrows move, Enter picks, Esc closes. Built on Radix
Context Menu (non-modal, so the action sheet can open from it).

### Avatar

The grey circle with a name's initial, as `leading` of a row about a person. Decorative.

### ConfirmRow

A red row that does something that can't be undone and isn't a list row («Удалить ребёнка»,
«Выйти»): `title`, `confirm` (`{title, message, action}` of the `ActionSheet`), `onConfirm`, which
runs only after the sheet's red action, `busy`, `disabled`. Looks like a `destructive` `ListRow`.
Same on every device.

### ActionSheet

Asks before something that can't be undone: `title` (the question), optional `message`,
`actions` (usually one `destructive`), and «Отменить» added last. Narrow windows (< 640px): an
iOS action sheet sliding up from the bottom, «Отменить» in its own block. Wide windows: a centred
dialog, «Отменить» its last line. Built on Radix Dialog: focus moves in and back to the trigger,
Esc or a tap outside cancels.

### Toast

A short message about something that happened away from the screen the Member is on, floating
above the bottom of the window in the 640px column (16px margins on a phone, above the home
indicator): `cell` with a hairline border and shadow, the text in `destructive`, and an ⓧ
(`clear` icon, named «Закрыть») that closes it. Announced as an `alert`; it disables nothing.
Placed once by the app (`app/SaveRejectedToast`), never by a screen. Its only use: «Не удалось
сохранить» (with the reason) after the server rejected a change, shown once, until closed or the
Member's next change.

### Spinner

«Сохраняем…» at the right of a row while it saves; rows show it through `busy`, which the
auto-save hooks set only after ~400 ms.
