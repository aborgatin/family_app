# Family App — Initial Plan

A private app for our family: two adults (users) and two daughters (profiles, no login).
Goal: **working and supportable** first, easy to extend, cheap to host, reusable by other families.

> This file is the initial plan only. Once implementation starts, details move to
> `docs/architecture/` (`backend.md`, `frontend.md`, `sync.md`, `deployment.md`).
> Key decisions and their reasoning live in [`docs/adr/`](adr/).

## 1. Product

- **Users:** husband and wife. **Children** are profiles (no login); the model allows giving them accounts later.
- **UI language:** Russian only, not switchable. All UI strings in i18n resource files from day one; backend returns codes, not texts → adding a language = adding a file.
- **Deployment model:** one installation per family ([ADR-0004](adr/0004-single-family-deployment.md)). Public repo, MIT license.

### Release 1 — MVP

1. **Shopping lists**
   - Grouped by **store type** (supermarket, pharmacy, household, online, …) with optional **ordered categories** per store type (e.g. supermarket: vegetables → dairy → bread …).
   - Item: name, free-text quantity ("2 кг"), note, store type + category, who added it.
   - Autocomplete from history; category is remembered per item name and applied automatically.
   - Bought items move to a "bought" section that can be cleared.
2. **Todos**
   - Lists are **private** (owner only) or **shared** (both adults).
   - Item: title, note, optional due date with push reminder, optional assignee (on shared lists), simple repeat (daily / weekly / monthly / yearly).
   - No subtasks, no location reminders.
3. **Children pages** (one per daughter)
   - Own todo list and wish list (always shared between parents).
   - Profile card with **user-defined fields** (clothes size, shoe size, allergies, teacher's phone, …).
4. **Wish lists** for adults too — plain shared lists, no special "reserved/hidden" logic.
5. **Settings (admin) screen**, available to any adult: family members, children, store types, categories and their order, child profile fields. Fresh install is seeded with sensible defaults ([ADR-0005](adr/0005-configuration-vs-code.md)).
6. **Notifications**
   - Global on/off per user; mute per list.
   - Never notify about own changes.
   - Batching: "Даша добавила 7 товаров в Супермаркет" instead of 7 pushes.
   - Todo due reminders always fire unless notifications are globally off.
7. **Auth:** email + password, long-lived session per device, invite link to add the second adult. Passkeys later.

### Later releases (outline only — to be brainstormed when we get there)

- **R2 — Links:** save links from Instagram / Telegram / YouTube etc. via iOS Shortcut in the share sheet; archive media (yt-dlp worker) so it survives source deletion.
- **R3 — Recipes:** manual entry, import from URL, "add ingredients to shopping list".
- **R4 — Travel planning:** trip page, itinerary, bookings, packing list (reuses lists), links (reuses R2).

### Backlog (ideas, not committed)

- Meal planner (needs recipes in structured form first).
- Google Calendar integration — purpose TBD.
- Documents vault — first evaluate ready solutions (Paperless-ngx for scanned documents, Vaultwarden for secrets); drop from backlog if one fits.
- Migrate the net-worth tracker from Google Sheets into the app.
- Native SwiftUI app (iPhone + Mac) on the same API, if PWA limitations become annoying.

### Explicitly out of scope

Chores/rewards, shared expenses, "reserved by" on wish lists, in-app calendar.

## 2. Architecture

```
 iPhone / Mac (PWA, installed to Home Screen / Dock)
   React + TypeScript + Vite, IndexedDB (Dexie) local store + outbox
        │  HTTPS REST  +  SSE (live updates)  +  Web Push (app closed)
        ▼
 Caddy (auto TLS, own domain)
        ▼
 Spring Boot 3 / Java 21 — modular monolith (serves API + built web app)
        ▼
 PostgreSQL (Flyway migrations)  ──nightly pg_dump──▶  Hetzner Storage Box
```

- **Client:** PWA first, native later if needed ([ADR-0001](adr/0001-pwa-first-client.md)). Share-to-app on iOS via a Shortcut that POSTs to the API.
- **Backend:** Spring Boot 3, Java 21, Spring Security (session auth), one deployable split into feature packages (`family`, `lists`, `notifications`, later `links`, `recipes`, `trips`).
- **Database:** PostgreSQL ([ADR-0002](adr/0002-postgresql.md)).
- **Sync:** offline-first with outbox + per-record versions, last-write-wins per field ([ADR-0003](adr/0003-sync-model.md)).
- **Hosting:** one Hetzner VPS (~€5–10/month) with Docker Compose: `app`, `postgres`, `caddy` (+ `media-worker` from R2). Own domain (~€10/year), required for HTTPS / Web Push.
- **CI/CD:** GitHub Actions → tests → one Docker image (web bundle inside) → GHCR. Deploy: `docker compose pull && docker compose up -d`.

### Core data model

| Entity | Key fields |
|---|---|
| `Family` | id, name (exactly one row per installation) |
| `Member` | id, family, email, password hash, display name, notifications_enabled |
| `Child` | id, family, name, color, birthday |
| `ChildField` / `ChildFieldValue` | user-defined profile fields and their values per child |
| `StoreType` | id, name, sort order |
| `Category` | id, store_type, name, sort order |
| `List` | id, type (`SHOPPING`/`TODO`/`WISH`), visibility (`PRIVATE`/`FAMILY`), owner, child?, name |
| `Item` | id, list, text, quantity, note, category?, done, due_at?, repeat?, assignee?, created_by, completed_by |
| `ItemHistory` | name → last category / store type (autocomplete + auto-categorisation) |
| `ListMute` | member, list |
| `PushSubscription` | member, endpoint, keys |

All mutable rows carry `version` (monotonic, for sync), `updated_at`, `deleted` (soft delete for sync).
Later modules (links, recipes, trips) get their own tables and **reuse** `List`/`Item` (e.g. trip packing list).

## 3. Repository layout

```
/backend   Spring Boot app (Gradle)
/web       React PWA
/deploy    docker-compose.yml, Caddyfile, backup scripts, .env.example
/docs      PLAN.md, adr/, architecture/ (created during implementation)
```

Secrets only in the server's `.env`, never in git.

## 4. MVP task breakdown

**M0 — Skeleton & deploy pipeline**
- [ ] Gradle Spring Boot project, Postgres via Docker Compose locally, Flyway baseline.
- [ ] Vite + React + TS PWA skeleton (manifest, service worker, i18n with `ru` only).
- [ ] Single Docker image (backend serves web bundle); GitHub Actions build + push to GHCR.
- [ ] Hetzner VPS, domain, Caddy, `.env.example`, nightly backup + documented restore.
- [ ] Create `docs/architecture/` (backend, frontend, sync, deployment).

**M1 — Family & auth**
- [ ] Member registration of first adult (bootstrap), login, long-lived session, invite link.
- [ ] Settings screen: members, children, store types, categories (order), child profile fields.
- [ ] Default seed data on first start.

**M2 — Lists core + sync**
- [ ] `List`/`Item` CRUD API with versions and soft deletes.
- [ ] Sync endpoints: push outbox ops, pull changes since version N.
- [ ] Client local store (Dexie), outbox, offline handling, SSE live refresh.

**M3 — Shopping**
- [ ] Store-type grouping, ordered categories, bought section + clear.
- [ ] Autocomplete & auto-categorisation from `ItemHistory`.

**M4 — Todos & children**
- [ ] Private/shared todo lists, due dates, assignee, repeat rules.
- [ ] Children pages: todo, wish list, profile card. Adult wish lists.

**M5 — Notifications**
- [ ] Web Push subscription (iOS 16.4+ installed PWA), global toggle, per-list mute.
- [ ] Change notifications with batching (skip own changes); due-date reminder scheduler.

**M6 — Hardening & handover**
- [ ] Install README for other families; backup/restore drill; make repo public.
