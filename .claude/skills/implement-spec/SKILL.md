---
name: implement-spec
description: "Implement the result of /to-spec and /to-tickets in code."
disable-model-invocation: true
---

You have been provided a spec. This spec should have tickets associated with it, describing how to implement the spec.

The issue tracker should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.

The goal is the entire spec implemented on a single **integration branch**, with every ticket resolved the way the issue tracker closes work.

The tickets are not a list of steps. They are a **task graph** with blocking relationships between them. This means there is always a **frontier** of tickets which are ready to be grabbed.

Start every subagent with a fresh context window.

Communication to and from subagents should be sparse. Communicate primarily through **context pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate information already available via pointers.

**Implementer subagents** should be run in the background where possible for maximum concurrency.

Briefs carry pointers and constraints, not shared values (a migration version, a port, a file name). Each implementer picks those from the integration branch tip when it merges. Every implementer and merger brief says: "Read each doc's `## Contents` index, then only the sections for your area; of the spec, only the sections your ticket cites."

## Usage budget

A run spans hours, so it is **budgeted**:

- At the start, run `caffeinate -ims -t 43200` in the background so the laptop stays awake while you wait.
- `usage.sh` (next to this file) prints the 5-hour usage % and reset time, from a 5-minute cache (`stale` when the endpoint is rate-limited: use that reading). Check it before every agent spawn. Run `watch-usage.sh 70` in the background; it refreshes the cache every 5 minutes and exits once usage reaches 70%.
- At 70%: spawn nothing new, let running agents finish and merge, post a resume note on the draft PR (merged, in progress, next), then wait in the background until the reset time and resume. Continue stopped agents with SendMessage rather than spawning fresh ones.

## Steps

1. Read the spec and tickets to understand the task graph.

2. (optional) Use an **exploration subagent** to conduct any exploration required by the tickets - relevant codebase files or external documentation. Ensure the exploration subagent can save files - it should save its markdown notes in a directory outside the repo, accessible by all future subagents. This lets **implementer subagents** focus on implementation rather than exploration.

3. Create the integration branch from `origin/main` with `git branch` and push it, without checking it out: a branch checked out in one worktree can't be checked out in another, and every merger needs it. Mergers work on a local branch from `origin/<integration>` and push with `git push origin HEAD:<integration>`. If the issue tracker closes work through PRs, or the user asks for one, open a draft PR after the first merge in step 5 (a branch with no commits ahead of main can't open one), marked as closing the spec and tickets.

4. Use a fresh **implementer subagent** for each ticket, each in its own worktree on its own branch. Before starting two frontier tickets together, compare the new pieces their tickets name (a table or migration, a sync event, a module API, the local store version, a shared screen or route): when both name the same one, start one now and the other after it merges. Each implementer subagent:
   - confirms its worktree is based on the integration branch before starting, and resets onto it if not;   - calls the Skill tool with `tdd` to build the ticket;
   - merges the integration branch tip into its own branch before reporting done

5. Once an **implementer subagent** completes, merge its work to the integration branch with a **merger subagent**. Before merging, the merger checks the ticket's diff against that ticket's acceptance criteria, the shared checks in `docs/agents/ticket-checks.md` and the spec sections they cite, and fixes or reports any gap. For every test the implementer reports as never seen failing, the merger mutation-checks it: break the code it covers, see the test fail, restore. The merger also runs the **Standards** axis of `code-review` on the ticket's diff (against the integration branch tip) and fixes every finding before merging: duplication of a shared helper, fixture or parser caught here costs one ticket, not a final-review sweep. A **flaky** test the merger meets (it fails, then passes on a rerun) is the merger's to fix, test-first: `scripts/repeat-test.sh <file>` red, fix the race, then the same command green. The ticket is done when every criterion is visibly met in the diff and the integration branch's checks pass after the merge.

6. If this changes the **frontier** of available tickets, kick off more **implementer subagents** to work on the new tickets. This allows for maximum concurrency.

7. Once all tickets are complete, call the Skill tool with `code-review` on the integration branch. Fix all issues raised by the code review in a single fresh **implementer subagent**.

8. If the spec has screens, run the app from the integration branch (the `run` skill) and screenshot every screen the spec touches, including empty and error states, into one artifact for the user. Show it and wait for their go-ahead: tests check roles and labels, never how a screen looks or reads.

9. If a draft PR exists, mark it ready for review. Otherwise, resolve each ticket the way the issue tracker closes work, and report the integration branch.

10. Clean up all **implementer subagent** worktrees, and stop the background `caffeinate` and usage watcher.
