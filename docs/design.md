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

| Token             | Light            | Dark             | Use                                         |
| ----------------- | ---------------- | ---------------- | ------------------------------------------- |
| `accent`          | `#0062CC`        | `#0A84FF`        | only things you can act on                  |
| `accent-fill`     | `#0062CC`        | `#0071E3`        | background of a filled (primary) button     |
| `on-accent`       | `#FFFFFF`        | `#FFFFFF`        | text on `accent-fill`                       |
| `background`      | `#F2F2F7`        | `#000000`        | grouped page background                     |
| `cell`            | `#FFFFFF`        | `#1C1C1E`        | grouped cells                               |
| `cell-pressed`    | `#D1D1D6`        | `#2C2C2E`        | a cell while pressed                        |
| `label`           | `#000000`        | `#FFFFFF`        | text                                        |
| `secondary-label` | `#6D6D72`        | `#98989F`        | values, hints, section headers, footers     |
| `tertiary-label`  | `#C4C4C7`        | `#5A5A5F`        | chevrons and other non-text decoration      |
| `separator`       | `#C6C6C8`        | `#38383A`        | hairlines between cells, under the nav bar  |
| `fill`            | `#E3E3E8`        | `#2C2C2E`        | segmented control track                     |
| `bar`             | `#F2F2F7` at 80% | `#161617` at 80% | the nav bar once content is under it        |
| `destructive`     | `#D70015`        | `#FF453A`        | delete, log out, errors                     |
| `segment`         | `#FFFFFF`        | `#636366`        | the selected segment of a segmented control |
| `overlay`         | black at 35%     | black at 55%     | the dimmed page behind an action sheet      |

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
- How: `useAutoSaveText()` / `useAutoSaveChoice()` from `shared/ui` hold all of this; a screen
  gives them the saved value and a `save(value)` that resolves with the value as saved, spreads
  the result onto an `InputRow` / `SegmentedRow`, and puts `<SaveFailure failures={[…]} />` in the
  `Section` footer. No screen writes its own saving state.
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
(`icon`), or an icon alone with a translated `label`. `type="submit"` inside a form. `size="small"`:
footnote-sized, for a section footer («Повторить»); it keeps its touch target without pushing the
lines apart. Touch: 44px
target; primary is 50px tall. Fine pointer: 28px (primary 36px). Hover dims it; disabled is 40%
opacity.

### Link

Goes to another screen (`to`). Looks like the `Button` of the same `variant`, and takes the same
content (text, icon + text, or icon + `label`). Use `Button` when it does anything besides
navigating.

### Icon

`<Icon name="settings" />`. Wraps `lucide-react`; features never import lucide. Names: `back`,
`chevron`, `home`, `settings`, `spinner`; a new icon is added to the map in `Icon.tsx`. Decorative
(`aria-hidden`) unless given a `label`. Takes the current text colour; default size 22px.

### EmptyState

A centred quiet message where a screen or list has nothing yet: optional large `icon`, the text,
an optional `action` under it (e.g. «Повторить»). Same on every device.

### Section

A group of the inset grouped list: optional `title` (small capitals, names the region), the cells
on a rounded card, optional `footer` (hints, `SaveFailure`). Children are rows; `rows={false}`
puts free content on one padded card instead, for M1 content not yet built from rows. Touch:
32px between sections; fine pointer: 24px.

### ListRow

One cell of a `Section`: `title`, optional `subtitle` (second, smaller line), `leading` (an
`Avatar`, a colour dot), `value` (right-aligned, secondary colour), `busy` (spinner). What it does
decides what it is:

- `to`: opens another screen, chevron on the right (a link);
- `onClick`: a button row; with `destructive` red text («Выйти», «Удалить …»);
- neither: shows something, not tappable (the «Взрослые» rows).

Touch: at least 44px tall, grey while pressed. Fine pointer: 36px, hover tint. The separator
starts where the text starts. Keyboard: tappable rows take focus (accent outline inside the cell),
Enter / Space activate them.

### Avatar

The grey circle with a name's initial, as `leading` of a row about a person. Decorative.

### InputRow

A row to edit text in place: the label left, a borderless input right-aligned. With
`useAutoSaveText()` spread its `input` onto it: Enter or leaving the field saves, Esc puts the
saved value back. `invalid` turns the text red and points the input at the footer message. Fine
pointer: the focused row gets the accent outline; touch: only the caret.

### SegmentedControl, SegmentedRow

A few mutually exclusive choices («Мужской / Женский», «Авто / Светлая / Тёмная»). Native radio
buttons underneath: Tab reaches the group, the arrow keys move the choice, and each move is a
choice (saved at once). `SegmentedRow` is the control as a cell: label left, control right, or
`labelHidden` for a control filling the cell (the label is then only its accessible name). With
`useAutoSaveChoice()` spread its `control` onto it. Touch: 32px segments in a 44px row; fine
pointer: 24px.

### ActionSheet

Asks before something that can't be undone: `title` (the question), optional `message`,
`actions` (usually one `destructive`), and «Отменить» added last. Narrow windows (< 640px): an
iOS action sheet sliding up from the bottom, «Отменить» in its own block. Wide windows: a centred
dialog, «Отменить» its last line. Built on Radix Dialog: focus moves in and back to the trigger,
Esc or a tap outside cancels.

### SaveFailure

The footer of a `Section` with auto-saved rows: `failures` = each row's `failure`. Shows the
message in red with «Повторить» (missing when trying again can't help, e.g. invalid input). Rows
that failed for the same reason share one message and one «Повторить».

### Spinner

«Сохраняем…» at the right of a row while it saves; rows show it through `busy`, which the
auto-save hooks set only after ~400 ms.

### TextField, GrammaticalGenderChoice

Still the M1 form controls of the auth screens and the M1 parts of Settings; the auth ticket of
spec #35 replaces them with grouped rows and a segmented control.
