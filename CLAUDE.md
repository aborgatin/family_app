# Family App

Architecture and conventions live in `docs/architecture/` (`backend.md`, `frontend.md`, `sync.md`, `deployment.md`): read the file for the area you're changing first.

Run all checks with `scripts/check.sh` (add `--image` to build and smoke-test the Docker image); query the local dev database with `scripts/db.sh "<sql>"`; screenshot the web app at phone and desktop width, light and dark, with `scripts/screenshot.sh --out <dir>`.

## Agent skills

Skills are in `.claude/skills/`; the grill → spec → tickets → implement → retro workflow is in `docs/agents/agentic-workflow.md`.

### Issue tracker

Issues live in GitHub Issues for `aborgatin/family_app` (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the repo root and ADRs in `docs/adr/`. See `docs/agents/domain.md`.
