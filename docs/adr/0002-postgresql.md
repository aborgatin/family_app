# 0002 — PostgreSQL as the database

- **Status:** Accepted
- **Date:** 2026-11-06

## Context
Requirements: reliable, well supported with Spring Boot, easy backups, good search for
Russian text (links, recipes later), concurrent access from two users with sync.

## Decision
Use **PostgreSQL** (Docker container), schema managed by **Flyway** migrations.

## Consequences
- Standard Spring Data JPA / JDBC tooling; huge documentation base.
- Built-in full-text search with Russian stemming; JSONB available for flexible fields
  (e.g. user-defined child profile fields if needed).
- Backups: nightly `pg_dump` to Hetzner Storage Box; restore procedure must be documented and tested.
- Slightly more to run than SQLite — acceptable inside Docker Compose.
