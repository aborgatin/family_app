# Architecture Decision Records

One file per significant decision: context, decision, consequences.
Add a new file (next number) instead of editing an accepted decision; mark the old one as superseded.

| # | Decision | Status |
|---|---|---|
| [0001](0001-pwa-first-client.md) | PWA first, native iOS/macOS later if needed | Accepted |
| [0002](0002-postgresql.md) | PostgreSQL as the database | Accepted |
| [0003](0003-sync-model.md) | Offline-first sync: outbox + versions, last-write-wins | Accepted |
| [0004](0004-single-family-deployment.md) | One installation per family | Accepted |
| [0005](0005-configuration-vs-code.md) | What is configurable vs hardcoded | Accepted (store types superseded by 0006) |
| [0006](0006-shopping-lists-replace-store-types.md) | Shopping lists replace store types; categories belong to a list | Accepted |
| [0007](0007-typed-child-fields-timeline-values.md) | Typed Child fields; values stored as a timeline | Accepted |
