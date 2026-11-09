# Agentic workflow

How a piece of work goes from an idea to merged code in this repo. Each step is a skill in
[`.claude/skills/`](../../.claude/skills/), typed as `/<name>` in Claude Code. Skills marked
**user-only** can't be started by the agent itself; the human types them.

```
grill → spec → decision docs PR → triage → tickets → implement → visual check → merge → manual QA → retro
```

## 0. Setting up a new laptop

Everything the workflow needs is in the repo, except accounts and tools:

1. Clone the repo. The skills in `.claude/skills/` load automatically in any Claude Code session
   opened inside it. `/setup-matt-pocock-skills` has already been run: its output is
   `docs/agents/` and the "Agent skills" section of `CLAUDE.md`. Don't run it again.
2. Install and log in: Claude Code (claude.ai account), `gh` 2.94 or newer (`gh auth login`;
   native sub-issues and blocking need it), Docker, Java 21, Node 22 (Homebrew `node@22` is
   keg-only; `scripts/check.sh` finds it).
3. Run `scripts/check.sh` once. It builds and tests backend and web; when it is green the laptop
   is ready. Local development: [`docs/architecture/`](../architecture/).
4. Personal copies of these skills in `~/.claude/skills/` take precedence over the repo's. Keep
   none there, or edits made in the repo won't take effect on that laptop.

## 1. Grill: `/grill-with-docs` (user-only)

Paste a brief: what and why, what is already decided, what is still open. The agent reads
`GLOSSARY.md`, `docs/PLAN.md`, `docs/adr/`, `CODING_STANDARDS.md` and the relevant
`docs/architecture/` file, plus any mock-up linked in the brief, then asks questions in rounds,
each with a recommended answer ("yes" accepts it).

- It looks up facts (code, docs, mock-ups) itself and only asks for decisions.
- It challenges terms against `GLOSSARY.md` and updates the glossary as soon as a term is
  settled. The glossary holds domain terms only, never UI mechanics or implementation.
- It offers an ADR only for a decision that is hard to reverse, surprising, and a real trade-off.
- It ends with a summary of everything decided and waits for "yes" before writing anything.

`/grill-me` is the same interview without the docs.

## 2. Spec: `/to-spec` (user-only)

Turns the grilled conversation into one GitHub issue, titled `Spec #N: <name> (<milestone>)`,
labelled `needs-triage`. Format (see spec #5 and #35): Problem Statement, Solution, User Stories,
Implementation Decisions, Testing Decisions, Out of Scope, Ticket sketch. Every decision from
the grill must appear in it.

## 3. Decision docs PR

Record a decision when it is made; describe code when it is built:

- **Now**, as a small docs-only PR merged before any ticket starts: new ADRs and their row in
  `docs/adr/README.md`, `GLOSSARY.md` changes, `docs/PLAN.md` changes. The spec links to them,
  and tickets running in parallel must all read the same settled decision from `main`.
- **Later, inside the tickets:** docs that describe code (`docs/architecture/*`, a design brief)
  and `CODING_STANDARDS.md` rules whose lint check needs the code to exist first.

Example: PR #34 (ADR-0008 and PLAN.md for spec #35).

## 4. Triage

The human reads the spec. If it's right, change its label from `needs-triage` to
`ready-for-agent` (`gh issue edit <n> --remove-label needs-triage --add-label ready-for-agent`).
`/triage` (user-only) runs the full triage state machine, mostly for incoming bugs and requests;
labels are in [`triage-labels.md`](triage-labels.md).

## 5. Tickets: `/to-tickets #<spec>` (user-only)

Breaks the spec into tracer-bullet tickets and publishes them as sub-issues of the spec with
native blocking links, labelled `ready-for-agent`.

- It proposes the breakdown first; the human approves it.
- Each ticket fits one fresh agent context, so the spec's own ticket sketch is often too coarse.
- A component or helper is built by the first ticket that needs it, not in a separate "build all
  components" ticket.
- A lint rule that would fail on code not yet migrated goes in the last ticket, blocked by all
  the migrations.
- Each ticket carries the shared checks (tests, screenshots, docs to update) in its body.
- One milestone = one integration branch and one PR (as #30), even with many tickets.

## 6. Implement: `/implement-spec #<spec>` (user-only)

Start it in a **new session**, on an up-to-date `main`. It runs the ticket graph:

- creates the integration branch, and a draft PR after the first merge that closes the spec and
  its tickets;
- gives each ticket on the frontier (all blockers closed) a fresh implementer agent in its own
  worktree, built test-first with `/tdd`, run in the background so tickets run in parallel;
- merges each finished ticket through a merger agent, which checks the diff against the ticket's
  acceptance criteria and runs `scripts/check.sh`;
- starts newly unblocked tickets as soon as their blockers merge;
- at the end, runs `/code-review` (standards from `CODING_STANDARDS.md` + spec match) and fixes
  every finding in one fresh agent.

**Usage budget** (from the M1 retro): a run takes hours and the claude.ai 5-hour usage limit
stops every running agent at once. The skill:

- runs `caffeinate` so the Mac doesn't sleep while unattended;
- checks usage with `.claude/skills/implement-spec/usage.sh` before every agent it starts (it
  reads the Claude Code OAuth token from the macOS Keychain; macOS only, never prints the token).
  The endpoint is rate-limited, so the reading is cached for 5 minutes in
  `~/.cache/family-app/usage` and the watcher is what refreshes it;
- runs `watch-usage.sh 70` in the background; at 70% it starts nothing new, lets running agents
  finish, posts a resume note on the draft PR, waits for the reset, then continues stopped
  agents with SendMessage.

For a single ticket outside a milestone: `/implement #<ticket>` (user-only), on a branch off
`main`.

## 7. Visual check

Tests check roles and labels, never how a screen looks. When the spec has screens,
`/implement-spec` runs the app and puts screenshots of every touched screen (including empty and
error states; for UI work 390px touch and 1280px mouse, light and dark) into one artifact, then
waits for the human's go-ahead before marking the PR ready.

## 8. Merge

The human reviews the PR (`/code-review` can be run again on it) and merges. Merging closes the
spec and its tickets.

## 9. Manual QA

Work only a person can do (real phones, accounts, money, the server) is a `ready-for-human`
ticket with a 🧑 in its title, e.g. #28 (acceptance on real phones). Findings become new issues;
M1's manual QA produced spec #35.

## 10. Retro: `/retro` (user-only)

After a milestone, run `/retro` on the implementation session. It suggests changes to the
agents' environment, most severe first: navigation pointers, automated checks (a mechanical rule
becomes a lint or CI check, not prose), coding standards, tool economy, information access. The
accepted ones become one tooling issue, implemented like any ticket. Example: #32 (migration
guard, `scripts/check.sh`, `scripts/db.sh`, the `CLAUDE.md` pointers); the usage budget in step 6
also came from the M1 retro.

## Other skills

- `/code-review`: standards + spec review of a branch or PR, by itself.
- `tdd`, `domain-modeling`, `grilling`, `codebase-design`, `writing-for-agents`: building blocks
  the steps above call; usable directly too.
- Editing a skill: change it in `.claude/skills/` in a PR, following `writing-for-agents`.

## Where things live

| What | Where |
|---|---|
| Skills | `.claude/skills/` (based on [mattpocock/skills](https://github.com/mattpocock/skills), MIT; see `.claude/skills/README.md`) |
| Tracker, labels, domain-doc conventions | `docs/agents/` |
| Vocabulary | `GLOSSARY.md` |
| Decisions | `docs/adr/` |
| Plan and milestones | `docs/PLAN.md` |
| What is built | `docs/architecture/` |
| Review rules | `CODING_STANDARDS.md` |
| All checks | `scripts/check.sh` |
