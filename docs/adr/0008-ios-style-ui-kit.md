# 0008 — iOS-style UI from our own shared/ui kit; iPhone first, Mac-ready

- **Status:** Accepted
- **Date:** 2026-11-07

## Context
Spec #1 (M1) defined no visual design, so every screen shipped as plain unstyled HTML. The app is
mainly used as an installed iPhone PWA, and second as a Mac web app (Safari → Add to Dock), on the
same code (ADR-0001). We want it to feel at home on the iPhone (like the Settings app), and we want
the Mac to come almost for free, not as a later rework of every screen. Agents build most screens,
so the rules must be written down and enforceable, not left to taste per screen.

Options considered: hand-written CSS; Tailwind + shadcn/ui (generic web look); a Material-style
component library; a ready iOS kit (Konsta UI, Ionic); Tailwind + Radix + our own small kit in the
iOS style.

## Decision
- **Look:** iOS style ("D · iOS kit"): large-title nav bar, grouped inset lists, rows with a chevron
  or a right-aligned value, segmented controls, borderless inline-editable rows.
- **Build:** Tailwind CSS + Radix primitives + about ten of our own components in
  `web/src/shared/ui`, `lucide-react` icons behind our own `Icon` component (SF Symbols may not be
  used on the web), dnd-kit for reordering (mouse, touch, keyboard). Not Konsta UI or Ionic: they
  bring their own routing/theming model and would still need Mac adaptation we can't control.
- **Features build screens only from `shared/ui`.** In `features/**`, raw form elements, `<a>`,
  `className` and `style` are forbidden by lint (CODING_STANDARDS U1). A new look is added to
  `shared/ui` first.
- **iPhone first, Mac-ready inside each component**, so feature screens never handle the Mac:
  - content sits in a centred column at most ~640px wide on wide windows; the page shell leaves
    room for a later two-pane layout (sidebar + content), which M2 lists will need;
  - edit mode («Изменить» / «Готово», ⊖ and drag handle) is the universal way to delete and
    reorder; swipe-to-delete is an extra on touch screens, right-click → «Удалить» on the Mac;
  - action sheets show as centred dialogs on wide windows;
  - tighter spacing with a fine pointer (`pointer-fine` / `pointer-coarse`), hover effects only
    where the device can hover, 44px tap targets on touch;
  - full keyboard support: visible focus, Enter saves, Esc cancels or closes.
- **Tokens:** accent `#0062CC` (light) / `#0A84FF` (dark), grouped background `#F2F2F7` with white
  cells, iOS red for destructive actions; the system font stack (SF on Apple devices) on the iOS type
  scale in `rem`. No web fonts, no Dynamic Type for now.
- **Theme:** light and dark from day one. Default follows the system; Settings «Оформление» offers
  «Авто / Светлая / Тёмная», stored per device (`localStorage`), applied before first paint.
- **Interactions:** editing something that exists auto-saves (on leaving a field, on tapping a
  choice); no Save buttons. Explicit confirmation stays only for auth forms, creating a new thing
  («Новый …» sheet with «Отмена» / «Готово») and changing the password. Every delete is confirmed
  with an action sheet; a full swipe never deletes on its own.
- The design brief agents follow is `docs/design.md`.

## Consequences
- Every M1 screen is restyled once (spec M1.5); later milestones build from the kit.
- Our own kit means we maintain ~10 components, including swipe and edit mode. In exchange they
  follow our accessibility, i18n (I2) and test-by-role (T1) rules, and adapt to the Mac in one place.
- The strict U1 rule makes small layout tweaks go through `shared/ui` props or components.
- True macOS details (toolbar, sidebar) and Dynamic Type are not covered; both can be added inside
  `shared/ui` later without touching feature screens.
- If PWA limits push us to native SwiftUI (backlog), this look maps directly onto standard iOS
  controls.
