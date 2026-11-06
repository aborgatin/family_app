# 0006 — Shopping lists replace store types; categories belong to a list

- **Status:** Accepted
- **Date:** 2026-11-06
- **Supersedes:** the "store types" part of [ADR-0005](0005-configuration-vs-code.md)

## Context
The plan grouped shopping items by a configurable **store type** (supermarket, pharmacy, …),
with ordered categories per store type. The point of store types was to keep separate
shopping lists for the supermarket, the pharmacy and so on. That is exactly what multiple
named lists already give us.

## Decision
- No `StoreType` entity. A family has **several shopping lists**, each named freely
  (Супермаркет, Аптека, …). Defaults seed a few of them.
- **Categories belong to a shopping list** and are ordered within it (walking order of that store).
  They are edited from the list itself, not from the Settings screen.
- Item history (autocomplete + auto-categorisation) is kept per shopping list.

## Consequences
- One concept fewer; mute and notification batching work per store for free, since a store is a list.
- Two lists for the same kind of store (e.g. two supermarkets) do not share categories; each
  has its own order, which matches reality.
- An item can't be moved between "store types" inside one list; it is moved to another list instead.
