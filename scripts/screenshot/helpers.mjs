// Steps and init scripts shared by screen configs (screens.mjs). A step is `async (page, ctx)`;
// ctx carries the variant's options (hasTouch, isMobile, viewport, colorScheme).

/** Init script: every fetch whose URL contains `part` never settles (a loading state). */
export const hang = (part) =>
  `const f = window.fetch; window.fetch = (i, o) => String(i && i.url ? i.url : i).includes('${part}') ? new Promise(() => {}) : f(i, o);`;

/** Init script: every sync pull answers without Lists, as if the Family had none yet. */
export const noLists = `
  const f = window.fetch;
  window.fetch = async (i, o) => {
    const r = await f(i, o);
    if (!String(i && i.url ? i.url : i).includes('/api/sync/pull')) return r;
    const body = await r.json();
    body.changes = body.changes.filter((c) => c.table !== 'list');
    return new Response(JSON.stringify(body), { status: r.status, headers: r.headers });
  };
`;

/** Init script: the server rejects every pushed operation with `code` (the rejection Toast). */
export const rejectPushes = (code) => `
  const f = window.fetch;
  window.fetch = async (i, o) => {
    const r = await f(i, o);
    if (!String(i && i.url ? i.url : i).includes('/api/sync/push')) return r;
    const body = await r.json();
    body.results = body.results.map(() => ({ status: 'rejected', code: '${code}', params: {} }));
    return new Response(JSON.stringify(body), { status: r.status, headers: r.headers });
  };
`;

/** Init script: the clipboard refuses every write (the copy-failed fallback). */
export const failClipboard = `
  Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, get() { return {
    write: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
    writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
  }; } });
`;

/** Init script: PUTs whose path starts with `prefix` wait `ms` before going out (a slow save). */
export const slowPut = (prefix, ms) => async (page) => {
  await page.route(
    (url) => url.pathname.startsWith(prefix),
    async (route) => {
      if (route.request().method() === 'PUT') await new Promise((r) => setTimeout(r, ms));
      await route.continue().catch(() => {});
    },
  );
};

/** A Settings section, found by its header (sections are `region`s named by it). */
export const section = (name) => `role=region[name="${name}"]`;

/** Scrolls a Settings section into view, then `by` pixels further. */
export const toSection =
  (name, by = 0) =>
  async (page) => {
    const s = page.locator(section(name));
    await s.waitFor();
    await s.scrollIntoViewIfNeeded();
    if (by) await page.evaluate((y) => window.scrollBy(0, y), by);
  };

/** Turns on edit mode in a Settings section. */
export const editIn = (name) => ({ click: `${section(name)} >> role=button[name="Изменить"]` });

/**
 * The row actions of the first row in a section. Touch: a real swipe left through CDP (Playwright
 * has no swipe). Mouse: a right-click, which opens the row's context menu.
 */
export const rowActions = (sectionName) => async (page, ctx) => {
  const row = page.locator(`${section(sectionName)} >> role=listitem >> nth=0`);
  await row.waitFor();
  await toSection(sectionName, 120)(page);
  const box = await row.boundingBox();
  if (!ctx.hasTouch) {
    await row.click({ button: 'right', position: { x: Math.min(200, box.width / 2), y: box.height / 2 } });
    await page.waitForTimeout(400);
    return;
  }
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const at = (x) => [{ x, y }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(box.x + 300) });
  for (let x = 290; x >= 40; x -= 25)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(box.x + x) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
};
