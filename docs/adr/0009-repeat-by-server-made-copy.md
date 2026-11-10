# 0009 — Repeat: the server adds a copy when the item is marked Done

- **Status:** Accepted
- **Date:** 2026-11-10

## Context
A todo item can have a Repeat (daily, weekly, monthly, yearly). Something must happen when a
repeating item is marked Done so that the next occurrence shows up. The app is offline-first
(ADR-0003): every other action takes effect on the device at once and reaches the server later, and
both Members may mark the same item Done while offline.

Alternatives considered:
- **Move the same item forward**: the item stays open and its Due date jumps to the next occurrence.
  An ordinary Last-write-wins field change, safe offline, but the item never reaches «Выполнено»: no
  record of who did it and when.
- **The device adds the copy**: instant offline, but two devices marking the same item Done would add
  two copies unless the copy's id is derived from the Done item, which adds rules to the client and
  to creating records.

## Decision
- Marking a repeating item Done keeps it as a Done item. In the same push operation the **server**
  adds an open copy: same text, Description, Assignee, Repeat and Creator, with the Due date at the
  next occurrence.
- The next occurrence is counted from the old Due date, not from the day it was marked Done, and
  moved forward until it lies in the future. A day the month doesn't have becomes the month's last
  day, and the copy repeats on that day from then on.
- The Repeat moves to the copy: the Done item no longer has one. Putting it back to open gives an
  ordinary item, and the copy stays.
- Devices never create the copy; they receive it through the pull.

## Consequences
- This is the one action whose full result waits for the server: marked Done offline, the item goes
  to «Выполнено» at once, and the next occurrence appears after the device syncs.
- Two devices marking the same item Done give one copy: the second `done = true` changes nothing.
- A mis-tap costs a manual delete of the copy.
- Done repeating items accumulate. A Todo list shows only the recently Done ones, with the older
  ones a tap away; nothing is removed unless a Member deletes it.
- "In the future" is judged by the server's clock in the installation's time zone.
