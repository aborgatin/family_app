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

/** Init script: every sync pull answers with only the Children of these names (none: no Children). */
export const onlyChildren = (...names) => `
  const f = window.fetch;
  window.fetch = async (i, o) => {
    const r = await f(i, o);
    if (!String(i && i.url ? i.url : i).includes('/api/sync/pull')) return r;
    const body = await r.json();
    const names = ${JSON.stringify(names)};
    body.changes = body.changes.filter((c) => c.table !== 'child' || (c.fields && names.includes(c.fields.name)));
    return new Response(JSON.stringify(body), { status: r.status, headers: r.headers });
  };
`;

/** Init script: every sync pull answers without Child fields (the Child profile's empty state). */
export const noChildFields = `
  const f = window.fetch;
  window.fetch = async (i, o) => {
    const r = await f(i, o);
    if (!String(i && i.url ? i.url : i).includes('/api/sync/pull')) return r;
    const body = await r.json();
    body.changes = body.changes.filter((c) => c.table !== 'child_field' && c.table !== 'child_field_value');
    return new Response(JSON.stringify(body), { status: r.status, headers: r.headers });
  };
`;

/**
 * Init script: the server rejects every pushed operation with `code` (the rejection Toast). The
 * operations never reach the server (an empty push fetches the Version), so the server's value
 * comes back on the next pull, as after a real rejection.
 */
export const rejectPushes = (code) => `
  const f = window.fetch;
  window.fetch = async (i, o) => {
    if (!String(i && i.url ? i.url : i).includes('/api/sync/push')) return f(i, o);
    const ops = JSON.parse(o.body).operations;
    const r = await f(i, { ...o, body: JSON.stringify({ operations: [] }) });
    const body = await r.json();
    body.results = ops.map(() => ({ status: 'rejected', code: '${code}', params: {} }));
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

/**
 * Init script: this device and push, for Settings «Уведомления». `permission` is `none` (no Push
 * API: Safari on iPhone, not installed), `default`, `denied` or `granted`; `subscribed` gives the
 * device a subscription (with keys the server accepts); `switchOn` makes the session say Анна's
 * Notifications switch is on. Service workers are blocked in these runs, so `serviceWorker.ready`
 * is faked too.
 */
export const pushDevice = ({ permission, subscribed = false, switchOn = false }) => `
  ${
    permission === 'none'
      ? 'delete window.Notification; delete window.PushManager;'
      : `
  const json = {
    endpoint: 'https://push.example/screenshots',
    expirationTime: null,
    keys: {
      p256dh: 'BAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0-P0A',
      auth: 'AAECAwQFBgcICQoLDA0ODw',
    },
  };
  const subscription = ${subscribed} ? { endpoint: json.endpoint, toJSON: () => json } : null;
  Object.defineProperty(window, 'Notification', { configurable: true, value: {
    permission: '${permission}',
    requestPermission: () => Promise.resolve('${permission}'),
  } });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    ready: Promise.resolve({ pushManager: {
      getSubscription: () => Promise.resolve(subscription),
      subscribe: () => Promise.reject(new DOMException('', 'NotAllowedError')),
    } }),
    register: () => new Promise(() => {}),
    getRegistration: () => Promise.resolve(undefined),
  } });`
  }
  ${
    switchOn
      ? `
  const f = window.fetch;
  window.fetch = async (i, o) => {
    const r = await f(i, o);
    if (!String(i && i.url ? i.url : i).includes('/api/auth/session')) return r;
    const body = await r.json();
    if (body.member) body.member.notificationsEnabled = true;
    return new Response(JSON.stringify(body), { status: r.status, headers: r.headers });
  };`
      : ''
  }
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
