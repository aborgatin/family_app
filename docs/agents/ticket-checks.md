# Ticket checks

Every ticket ends with these checks, on top of its own acceptance criteria. The implementer meets
them; the merger verifies them in the diff. A ticket body points here instead of copying them.

How to run things, so the worktree guard lets every call through:

- Run any build or test command through `scripts/with-toolchain.sh`, which finds JDK 21 and Node
  22: `../scripts/with-toolchain.sh ./gradlew test --tests '*ItemSyncTest'` from `backend/`,
  `../scripts/with-toolchain.sh npx vitest run src/features/lists` from `web/`.
- Create and edit files with Write/Edit.
- Run each git command as its own call, with literal arguments (a message, a path, a SHA), from the
  worktree root.

- **Test-first** with `/tdd`, through the public seam only (T1): every behaviour change has a test
  seen failing first (T2). A test that passed on its first run is mutation-checked: break the code
  it covers, see it fail, restore.
- **`scripts/check.sh` is green** on the branch after merging the integration branch tip.
- **Every new server error code has a client message** (I3; the guard in `check.sh` enforces it).
- **Docs in the same PR**: the parts of `docs/architecture/` (`backend.md`, `frontend.md`,
  `sync.md`, `deployment.md`) and `docs/design.md` that describe what the ticket built.
- **Screenshots of the routes the ticket adds or changes**, including their empty and error states:
  `scripts/screenshot.sh --out <dir> --only <route,route,…>`, at all four variants. Add a route to
  `scripts/screenshot/screens.mjs` for each new screen or state. Shoot only those routes: a full run
  (every route) takes tens of minutes, while a few routes take a minute or two. Look at the phone
  width yourself before reporting. Steps use real Playwright clicks, taps and keys
  (`scripts/check-screens.sh` rejects `dispatchEvent`, `force: true` and clicks inside
  `evaluate`): a step that works only with a faked interaction is a bug in the screen, to fix in
  the ticket or report.
