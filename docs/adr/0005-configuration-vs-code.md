# 0005 — What is configurable vs hardcoded

- **Status:** Accepted
- **Date:** 2026-11-06

## Context
Store types, categories, children etc. differ per family. We don't want to change code
for that, but making *everything* configurable would make the app complex.

## Decision
- **Editable in the app (Settings screen, any adult):** family members, children
  (name, color, birthday), store types, categories per store type and their order,
  child profile fields. Seeded with sensible Russian defaults on first start.
- **Deployment config (`.env` / `application.yml`):** domain, storage limits, backup
  settings, secrets.
- **Code:** list kinds (shopping, todo, wish; later packing), features and their behavior.

## Consequences
- Another family can adapt the app without programming.
- New list kinds or features require code changes — intentional.
