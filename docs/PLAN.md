# Family App — Initial Plan

A private app for our family: two adults (members) and two daughters (children: profiles, no login).
Vocabulary: see [`GLOSSARY.md`](../GLOSSARY.md).
Goal: **working and supportable** first, easy to extend, cheap to host, reusable by other families.

> This file is the initial plan only. What is actually built is described in
> [`docs/architecture/`](architecture/): [`backend.md`](architecture/backend.md),
> [`frontend.md`](architecture/frontend.md), [`sync.md`](architecture/sync.md),
> [`deployment.md`](architecture/deployment.md).
> Key decisions and their reasoning live in [`docs/adr/`](adr/).

## 1. Product

- **Members:** husband and wife (the adults who log in). **Children** are profiles (no login); the model allows giving them accounts later.
- **UI language:** Russian only, not switchable. All UI strings in i18n resource files from day one; backend returns codes, not texts → adding a language = adding a file.
- **Deployment model:** one installation per family ([ADR-0004](adr/0004-single-family-deployment.md)). Public repo, MIT license.

### Release 1 — MVP

1. **Shopping lists**
   - Several shopping lists, named after where you buy (Супермаркет, Аптека, Хозтовары, Онлайн, …) ([ADR-0006](adr/0006-shopping-lists-replace-store-types.md)), each with optional **ordered categories** (e.g. Супермаркет: vegetables → dairy → bread …).
   - Item: name, free-text quantity ("2 кг"), note, category, creator (who added it).
   - Autocomplete from item history per list; category is remembered per item name and applied automatically.
   - Done items move to the "bought" section (Куплено) that can be cleared.
2. **Todos**
   - Lists are **private** (owner only) or **shared** (both adults).
   - Item: title, note, optional due date with reminder, optional assignee (a member, on shared lists), simple repeat (daily / weekly / monthly / yearly).
   - No subtasks, no location reminders.
3. **Children pages** (one per daughter)
   - Own todo list and wish list (always shared between members).
   - Child profile with **user-defined child fields** (clothes size, shoe size, allergies, teacher's phone, …).
4. **Wish lists** for adults too — plain shared lists, no special "reserved/hidden" logic.
5. **Settings (admin) screen**, available to any adult: members, children, child fields. Categories and their order are edited on each shopping list. Fresh install is seeded with sensible defaults ([ADR-0005](adr/0005-configuration-vs-code.md)).
6. **Notifications**
   - Global on/off per member; mute per list (mutes notifications, not reminders).
   - Never notify about own changes.
   - Batching: "Даша добавила 7 товаров в Супермаркет" instead of 7 pushes.
   - Reminders (todo due dates) always fire unless notifications are globally off.
7. **Auth:** email + password, long-lived session per device, invite link to add the second adult. Passkeys later.

### Later releases (outline only — to be brainstormed when we get there)

- **R1.5 — Claude (MCP):** a remote MCP server built into the app, starting after M5. Read: children with their fields, todo lists, wish lists, shopping lists. Write: create lists and items, so Claude can turn a plan into a todo list or a recipe into a shopping list. It acts as the logged-in member, so the sync and notification rules apply unchanged. To grill before starting: auth (per-member token vs OAuth for claude.ai), which tools to offer, and limits on what it can write. Overlaps with R3: revisit R3's scope once this exists.
- **R2 — Links:** save links from Instagram / Telegram / YouTube etc. via iOS Shortcut in the share sheet; archive media (yt-dlp worker) so it survives source deletion.
- **R3 — Recipes:** manual entry, import from URL, "add ingredients to shopping list".
- **R4 — Travel planning:** trip page, itinerary, bookings, packing list (reuses lists), links (reuses R2).

### Backlog (ideas, not committed)

- Meal planner (needs recipes in structured form first).
- Child field history: a per-field «Хранить историю» switch showing past values (e.g. a growth chart for «Рост»/«Вес»), built on the M4 value timeline ([ADR-0007](adr/0007-typed-child-fields-timeline-values.md)).
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
- **Backend:** Spring Boot 3, Java 21, Spring Security (session auth), one deployable split into feature packages (`family`, `lists`, `notifications`, later `mcp`, `links`, `recipes`, `trips`).
- **UI:** iOS-style (large titles, grouped lists), iPhone first and Mac-ready; Tailwind + Radix + our own `shared/ui` kit, which feature screens are built from exclusively; light and dark theme ([ADR-0008](adr/0008-ios-style-ui-kit.md); design brief `docs/design.md` arrives with M1.5).
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
| `ChildField` / `ChildFieldValue` | user-defined profile fields with a value type (`TEXT`/`DATE`), and a timeline of values per child ([ADR-0007](adr/0007-typed-child-fields-timeline-values.md)) |
| `Category` | id, list (shopping only), name, sort order |
| `List` | id, kind (`SHOPPING`/`TODO`/`WISH`), visibility (`PRIVATE`/`SHARED`), owner, child?, name |
| `Item` | id, list, text, quantity, note, category?, done, due_at?, repeat?, assignee? (member), created_by, done_by |
| `ItemHistory` | list + name → last category (autocomplete + auto-categorisation) |
| `ListMute` | member, list |
| `PushSubscription` | member, endpoint, keys |

All mutable rows carry `version` (monotonic, for sync), `updated_at`, `deleted` (soft delete for sync).
Later modules (links, recipes, trips) get their own tables and **reuse** `List`/`Item` (e.g. trip packing list).

## 3. Repository layout

```
/backend   Spring Boot app (Gradle)
/web       React PWA
/deploy    docker-compose.yml, Caddyfile, backup scripts, .env.example
/docs      PLAN.md, adr/, architecture/ (what is built: backend, frontend, sync, deployment)
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
- [ ] Settings screen: members, children, child fields.
- [ ] Default seed data on first start.

**M1.5 — UI foundation**
- [ ] ADR-0008, design brief `docs/design.md`, standards rule U1; Tailwind, the `shared/ui` kit with its Mac behaviour, the app shell, light/dark theme.
- [ ] Restyle the auth screens (`/setup`, `/login`, `/invite/:token`, `/reset-password/:token`).
- [ ] Restyle Home and Settings: edit mode, swipe-to-delete, auto-save, Child screen, password screen, theme switch.

**M2 — Lists core + sync**
- [ ] `List`/`Item` CRUD API with versions and soft deletes.
- [ ] Sync endpoints: push outbox ops, pull changes since version N.
- [ ] Client local store (Dexie), outbox, offline handling, SSE live refresh.

**M3 — Shopping**
- [ ] Multiple shopping lists, ordered categories per list, bought section + clear.
- [ ] Autocomplete & auto-categorisation from `ItemHistory`.

**M4 — Todos & children**
- [ ] Private/shared todo lists, due dates, assignee, repeat rules.
- [ ] Child pages: todo list, wish list, child profile. Member wish lists.
- [ ] Child field values stored as a timeline of entries; the Child profile shows the latest entry and the birthday ([ADR-0007](adr/0007-typed-child-fields-timeline-values.md)).

**M5 — Notifications**
- [ ] Web Push subscription (iOS 16.4+ installed PWA), global toggle, per-list mute.
- [ ] Change notifications with batching (skip own changes); due-date reminder scheduler.

**M6 — Hardening & handover**
- [ ] Install README for other families; backup/restore drill; make repo public.
