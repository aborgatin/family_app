#!/usr/bin/env node
// Screenshots of the web app at 390px touch and 1280px mouse, in light and dark. Run it through
// scripts/screenshot.sh; README.md next to this file has the options and the screens file format.
// Not part of CI.
//
// Starts, from the given worktree: a throwaway PostgreSQL 18 container (docker, random host port,
// tmpfs), the backend jar (`./gradlew bootJar`, then `java -jar` on a free port), and the Vite dev
// server (free port, BACKEND_URL pointing at that backend). Seeds data through the real API, shoots
// every route in 4 variants (390x844 touch / 1280x800 mouse x light / dark), tears everything down.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const exec = promisify(execFile);

// ---------- arguments --------------------------------------------------------------------------
function parseArgs(argv) {
  const a = {
    worktree: path.resolve(HERE, '../..'),
    config: path.join(HERE, 'screens.mjs'),
    variants: null,
    only: null,
    skipBuild: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--worktree') a.worktree = v();
    else if (k === '--config') a.config = v();
    else if (k === '--out') a.out = v();
    else if (k === '--variants') a.variants = v().split(',');
    else if (k === '--only') a.only = v().split(',');
    else if (k === '--skip-build') a.skipBuild = true;
    else if (k === '-h' || k === '--help') a.help = true;
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));
if (args.help || !args.out) {
  console.error(
    'usage: scripts/screenshot.sh --out <dir> [--only name,...] [--config <screens.mjs|.json>] ' +
      '[--worktree <path>] [--variants mobile-light,mobile-dark,desktop-light,desktop-dark] [--skip-build]',
  );
  process.exit(2);
}
const worktree = path.resolve(args.worktree);
const outDir = path.resolve(args.out);
const logDir = path.join(outDir, '_logs');
fs.mkdirSync(logDir, { recursive: true });

const VARIANTS = {
  'mobile-light': { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, colorScheme: 'light' },
  'mobile-dark': { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, colorScheme: 'dark' },
  'desktop-light': { viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false, deviceScaleFactor: 1, colorScheme: 'light' },
  'desktop-dark': { viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false, deviceScaleFactor: 1, colorScheme: 'dark' },
};
const variantNames = args.variants ?? Object.keys(VARIANTS);
for (const v of variantNames) if (!VARIANTS[v]) throw new Error(`unknown variant ${v}`);

// ---------- config -----------------------------------------------------------------------------
async function loadConfig(file) {
  const abs = path.resolve(file);
  if (abs.endsWith('.json')) return JSON.parse(fs.readFileSync(abs, 'utf8'));
  return (await import(pathToFileURL(abs).href)).default;
}
const config = await loadConfig(args.config);
let routes = config.routes ?? [];
if (args.only) routes = routes.filter((r) => args.only.includes(r.name));
if (!routes.length) throw new Error('no routes to shoot');

// ---------- process management -----------------------------------------------------------------
const cleanups = [];
let cleaning = false;
async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  for (const fn of cleanups.reverse()) {
    try {
      await fn();
    } catch (e) {
      console.error('cleanup:', e.message);
    }
  }
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, async () => {
    console.error(`\n${sig}: tearing down`);
    await cleanup();
    process.exit(130);
  });
}

const log = (...m) => console.log(`[shoot ${new Date().toISOString().slice(11, 19)}]`, ...m);

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** Spawns a long-running process in its own process group, logging to _logs/<name>.log. */
function startProcess(name, cmd, cmdArgs, opts) {
  const out = fs.openSync(path.join(logDir, `${name}.log`), 'w');
  const child = spawn(cmd, cmdArgs, { ...opts, detached: true, stdio: ['ignore', out, out] });
  let exited = false;
  child.on('exit', () => (exited = true));
  const stop = async () => {
    if (exited) return;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
    for (let i = 0; i < 50 && !exited; i++) await sleep(100);
    if (!exited)
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
  };
  cleanups.push(stop);
  return { child, stop, isExited: () => exited };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(what, fn, { timeoutMs = 180_000, proc } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (proc?.isExited()) throw new Error(`${what}: process exited early, see ${logDir}`);
    try {
      if (await fn()) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`${what}: timed out, see ${logDir}`);
}

/** Node 22+, as scripts/check.sh finds it (PATH, else Homebrew's keg-only node@22). */
function nodeEnvPath() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 22) return process.env.PATH;
  for (const d of ['/opt/homebrew/opt/node@22/bin', '/usr/local/opt/node@22/bin'])
    if (fs.existsSync(`${d}/node`)) return `${d}:${process.env.PATH}`;
  throw new Error('Node 22+ not found');
}

// ---------- services ---------------------------------------------------------------------------
const runId = `${process.pid}-${Date.now().toString(36)}`;
const DB = { name: 'family', user: 'family', password: 'family' };

async function startPostgres() {
  const name = `family-shot-${runId}`;
  log(`postgres: starting container ${name}`);
  await exec('docker', [
    'run', '-d', '--rm', '--name', name,
    '-e', `POSTGRES_DB=${DB.name}`, '-e', `POSTGRES_USER=${DB.user}`, '-e', `POSTGRES_PASSWORD=${DB.password}`,
    '--tmpfs', '/var/lib/postgresql', '-p', '127.0.0.1::5432', 'postgres:18',
  ]);
  cleanups.push(async () => {
    log(`postgres: removing ${name}`);
    await exec('docker', ['rm', '-f', name]).catch(() => {});
  });
  const { stdout } = await exec('docker', ['port', name, '5432/tcp']);
  const port = Number(stdout.trim().split('\n')[0].split(':').pop());
  // pg_isready answers early during initdb's temporary server; require a real query over TCP.
  await waitFor('postgres', async () => {
    await exec('docker', ['exec', name, 'psql', '-h', '127.0.0.1', '-U', DB.user, '-d', DB.name, '-tAc', 'SELECT 1']);
    return true;
  }, { timeoutMs: 60_000 });
  log(`postgres: ready on 127.0.0.1:${port}`);
  return { name, port };
}

async function buildBackend() {
  const dir = path.join(worktree, 'backend');
  const libs = path.join(dir, 'build', 'libs');
  if (!args.skipBuild) {
    log('backend: ./gradlew bootJar (log: _logs/gradle.log)');
    const out = fs.openSync(path.join(logDir, 'gradle.log'), 'w');
    const code = await new Promise((resolve) => {
      const p = spawn('./gradlew', ['bootJar', '--console=plain'], { cwd: dir, stdio: ['ignore', out, out] });
      p.on('exit', resolve);
    });
    if (code !== 0) throw new Error(`gradle bootJar failed (exit ${code}), see ${logDir}/gradle.log`);
  }
  const jar = fs.readdirSync(libs).find((f) => f.endsWith('.jar') && !f.endsWith('-plain.jar'));
  if (!jar) throw new Error(`no boot jar in ${libs}`);
  return path.join(libs, jar);
}

function backendEnv(pg, port) {
  return {
    ...process.env,
    DATASOURCE_URL: `jdbc:postgresql://127.0.0.1:${pg.port}/${DB.name}`,
    DATASOURCE_USERNAME: DB.user,
    DATASOURCE_PASSWORD: DB.password,
    SERVER_PORT: String(port),
    DOMAIN: 'localhost',
  };
}

function javaBin() {
  return process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java') : 'java';
}

async function startBackend(jar, pg) {
  const port = await freePort();
  log(`backend: java -jar ${path.relative(worktree, jar)} on :${port}`);
  const proc = startProcess('backend', javaBin(), ['-jar', jar], { env: backendEnv(pg, port) });
  await waitFor('backend', async () => (await fetch(`http://127.0.0.1:${port}/actuator/health`)).ok, { proc });
  log('backend: healthy');
  return { port, proc };
}

async function startVite(backendPort) {
  const web = path.join(worktree, 'web');
  const PATH = nodeEnvPath();
  const lock = path.join(web, 'node_modules', '.package-lock.json');
  if (!fs.existsSync(lock) || fs.statSync(path.join(web, 'package-lock.json')).mtimeMs > fs.statSync(lock).mtimeMs) {
    log('web: npm ci (log: _logs/npm.log)');
    const out = fs.openSync(path.join(logDir, 'npm.log'), 'w');
    const code = await new Promise((resolve) => {
      const p = spawn('npm', ['ci'], { cwd: web, env: { ...process.env, PATH }, stdio: ['ignore', out, out] });
      p.on('exit', resolve);
    });
    if (code !== 0) throw new Error(`npm ci failed, see ${logDir}/npm.log`);
  }
  const port = await freePort();
  log(`web: vite on :${port}`);
  const proc = startProcess('vite', 'node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: web,
    env: { ...process.env, PATH, BACKEND_URL: `http://127.0.0.1:${backendPort}` },
  });
  await waitFor('vite', async () => (await fetch(`http://127.0.0.1:${port}/`)).ok, { proc, timeoutMs: 60_000 });
  log('web: vite ready');
  // `localhost` (not 127.0.0.1) so Secure cookies and crypto.randomUUID() work like in dev.
  return { url: `http://localhost:${port}`, proc };
}

/** Runs the operator command `reset-password <email>` and returns the token from the printed link. */
async function createResetToken(jar, pg, email) {
  const { stdout } = await exec(javaBin(), ['-jar', jar, 'reset-password', email], { env: backendEnv(pg, 0) });
  const m = stdout.match(/\/reset-password\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error(`reset-password printed no link:\n${stdout}`);
  return m[1];
}

// ---------- database snapshot, for routes with `isolate: true` ----------------------------------
/** Runs psql in the container with `input` on stdin; resolves with stdout. */
function psql(pg, input, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', ['exec', '-i', pg.name, 'psql', '-U', DB.user, '-d', DB.name, '-v', 'ON_ERROR_STOP=1', '-q', ...extraArgs]);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`psql failed: ${err}`))));
    p.stdin.end(input);
  });
}

/** The rows Flyway left after migrating (e.g. the Defaults Child fields), before anything is seeded. */
async function snapshotMigratedData(pg) {
  const { stdout } = await exec(
    'docker',
    ['exec', pg.name, 'pg_dump', '-U', DB.user, '-d', DB.name, '--data-only', '--exclude-table=flyway_schema_history'],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  return stdout;
}

/** Empties every table but Flyway's history and puts the migrated rows back. */
async function restoreMigratedData(pg, snapshot) {
  await psql(
    pg,
    `DO $$ DECLARE t text; BEGIN
       SELECT string_agg(format('%I', tablename), ', ') INTO t FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> 'flyway_schema_history';
       IF t IS NOT NULL THEN EXECUTE 'TRUNCATE ' || t || ' RESTART IDENTITY CASCADE'; END IF;
     END $$;`,
  );
  // Triggers off while the rows go back: they already carry their versions, and pg_dump's empty
  // search_path would break triggers that call unqualified functions (bump_version → version_seq).
  await psql(pg, `SET session_replication_role = replica;\n${snapshot}`);
}

// ---------- seeding through the real API -------------------------------------------------------
export const SEED = {
  member: { email: 'anna@example.com', password: 'password123', displayName: 'Анна', grammaticalGender: 'FEMININE' },
  secondMember: { email: 'boris@example.com', password: 'password123', displayName: 'Борис', grammaticalGender: 'MASCULINE' },
  children: [
    { name: 'Маша', color: 'coral', birthday: '2019-04-12' },
    { name: 'Петя', color: 'blue', birthday: null },
    { name: 'Соня', color: 'green', birthday: '2022-09-01' },
  ],
  // Lists by Member: Борис's Private one never reaches Анна, whom every route is logged in as.
  lists: {
    member: [
      { name: 'Супермаркет', kind: 'SHOPPING', visibility: 'SHARED' },
      { name: 'Аптека', kind: 'SHOPPING', visibility: 'SHARED' },
      { name: 'Ремонт', kind: 'TODO', visibility: 'PRIVATE' },
      { name: 'Дела по дому', kind: 'TODO', visibility: 'SHARED' },
      { name: 'Желания Маши', kind: 'WISH', visibility: 'SHARED' },
    ],
    secondMember: [
      { name: 'Гараж', kind: 'TODO', visibility: 'SHARED' },
      { name: 'Подарок Анне', kind: 'TODO', visibility: 'PRIVATE' },
    ],
  },
  extraChildFields: [{ name: 'Размер обуви', valueType: 'TEXT', position: 3 }, { name: 'Последний визит к врачу', valueType: 'DATE', position: 4 }],
};

/** Calls the API from inside the page, the way the app does (same origin, XSRF header). */
async function api(page, method, url, body) {
  return page.evaluate(
    async ({ method, url, body }) => {
      if (!document.cookie.includes('XSRF-TOKEN=')) await fetch('/api/auth/session');
      const xsrf = decodeURIComponent((document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || '');
      const r = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrf },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${text}`);
      return text ? JSON.parse(text) : null;
    },
    { method, url, body },
  );
}

/** Creates Lists through the sync push as the Member logged in on `page`. */
async function pushLists(page, lists) {
  const operations = lists.map((fields) => ({ table: 'list', id: crypto.randomUUID(), op: 'upsert', fields }));
  const pushed = await api(page, 'POST', '/api/sync/push', { operations });
  if (pushed.results.some((r) => r.status !== 'applied')) throw new Error(`seed lists: ${JSON.stringify(pushed.results)}`);
}

async function seed(browser, baseUrl) {
  log('seed: bootstrap Member, second Member via Invite, Children, Lists, Child fields, active Invite');
  const ctx = await browser.newContext({ baseURL: baseUrl });
  const page = await ctx.newPage();
  await page.goto('/api/auth/session');
  await api(page, 'POST', '/api/auth/bootstrap', SEED.member);

  // Second Member: accept an Invite in a separate (logged-out) context.
  const inv1 = await api(page, 'POST', '/api/invites');
  const token1 = inv1.url.split('/invite/')[1];
  const ctx2 = await browser.newContext({ baseURL: baseUrl });
  const p2 = await ctx2.newPage();
  await p2.goto('/api/auth/session');
  await api(p2, 'POST', `/api/invites/by-token/${token1}/accept`, SEED.secondMember);
  await pushLists(p2, SEED.lists.secondMember);
  await ctx2.close();
  await pushLists(page, SEED.lists.member);

  // Children and Child fields are written only through the sync push (spec #3).
  const operations = [
    ...SEED.children.map((fields) => ({ table: 'child', id: crypto.randomUUID(), op: 'upsert', fields })),
    ...SEED.extraChildFields.map((fields) => ({ table: 'child_field', id: crypto.randomUUID(), op: 'upsert', fields })),
  ];
  const pushed = await api(page, 'POST', '/api/sync/push', { operations });
  if (pushed.results.some((r) => r.status !== 'applied')) throw new Error(`seed: ${JSON.stringify(pushed.results)}`);
  const inv2 = await api(page, 'POST', '/api/invites'); // stays active: shows in Settings, used as {inviteToken}
  const storageState = await ctx.storageState();
  await ctx.close();
  return { storageState, inviteToken: inv2.url.split('/invite/')[1] };
}

// ---------- shooting ---------------------------------------------------------------------------
/**
 * Step forms (JSON): {"click": sel}, {"tap": sel}, {"fill": sel, "value": str}, {"press": key},
 * {"hover": sel}, {"waitFor": sel}, {"wait": ms}, {"eval": "js expression"}, {"scroll": sel}.
 * Selectors are Playwright selectors, e.g. `role=button[name="Добавить ребёнка"]`, `text=Дети`.
 * In a .mjs config a step may also be `async (page, ctx) => {...}`.
 */
async function runStep(page, step, ctx) {
  if (typeof step === 'function') return step(page, ctx);
  const t = { timeout: 10_000 };
  if (step.click) return page.locator(step.click).first().click(t);
  if (step.tap) return page.locator(step.tap).first().tap(t);
  if (step.fill) return page.locator(step.fill).first().fill(step.value ?? '', t);
  if (step.press) return page.keyboard.press(step.press);
  if (step.hover) return page.locator(step.hover).first().hover(t);
  if (step.waitFor) return page.locator(step.waitFor).first().waitFor(t);
  if (step.scroll) return page.locator(step.scroll).first().scrollIntoViewIfNeeded(t);
  if (step.wait) return sleep(step.wait);
  if (step.eval) return page.evaluate(step.eval);
  throw new Error(`unknown step ${JSON.stringify(step)}`);
}

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await sleep(300);
}

// Only the backend API (/api/...), not Vite's source modules such as /src/shared/api/client.ts.
const blockApi = (ctx) =>
  ctx.route((url) => url.pathname.startsWith('/api/'), (r) => r.abort('internetdisconnected'));

async function shootRoute(browser, baseUrl, route, state, variant) {
  const { storageState, tokens } = state;
  const auth = route.auth ?? 'member';
  const ctx = await browser.newContext({
    ...VARIANTS[variant],
    baseURL: baseUrl,
    locale: 'ru-RU',
    timezoneId: 'Europe/Berlin',
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
    storageState: auth === 'member' ? storageState : undefined,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  // route.localStorage: {key: value} set before any app script runs (e.g. a stored theme choice).
  if (route.localStorage)
    await ctx.addInitScript((entries) => {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, route.localStorage);
  if (route.initScript) await ctx.addInitScript({ content: route.initScript });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  const urlPath = route.path.replace(/\{(\w+)\}/g, (_, k) => {
    if (!tokens[k]) throw new Error(`no value for {${k}}`);
    return tokens[k];
  });
  const errors = [];
  try {
    if (route.offline === 'start') await blockApi(ctx);
    await page.goto(urlPath, { waitUntil: 'domcontentloaded' });
    await settle(page);
    if (route.offline === 'afterLoad') {
      await blockApi(ctx);
      await ctx.setOffline(true); // navigator.onLine = false + 'offline' event; the page stays loaded
    }
    for (const step of route.steps ?? []) {
      try {
        await runStep(page, step, { variant, ...VARIANTS[variant] });
      } catch (e) {
        errors.push(`step ${JSON.stringify(step)}: ${e.message.split('\n')[0]}`);
        break;
      }
    }
    await settle(page);
  } catch (e) {
    errors.push(e.message.split('\n')[0]);
  }
  const file = path.join(outDir, `${route.name}--${variant}.png`);
  await page.screenshot({ path: file, fullPage: route.fullPage ?? true, animations: 'disabled' }).catch((e) => errors.push(`screenshot: ${e.message}`));
  const finalUrl = page.url();
  await ctx.close();
  return { route: route.name, variant, file, url: finalUrl.replace(baseUrl, ''), errors, consoleErrors };
}

// ---------- main -------------------------------------------------------------------------------
let exitCode = 0;
try {
  for (const p of [worktree, path.join(worktree, 'backend', 'gradlew'), path.join(worktree, 'web', 'package.json')])
    if (!fs.existsSync(p)) throw new Error(`not a Family App worktree: ${p} missing`);
  await exec('docker', ['info']).catch(() => {
    throw new Error('Docker is not running');
  });

  const [pg, jar] = await Promise.all([startPostgres(), buildBackend()]);
  const backend = await startBackend(jar, pg);
  const vite = await startVite(backend.port);
  const migrated = routes.some((r) => r.isolate) ? await snapshotMigratedData(pg) : null;
  const browser = await chromium.launch({ channel: process.env.SHOOT_CHANNEL ?? 'chrome', headless: true });
  cleanups.push(() => browser.close());

  const needsReset = (list) => list.some((r) => r.path.includes('{resetToken}'));
  const seedState = async (list) => {
    const { storageState, inviteToken } = await seed(browser, vite.url);
    const tokens = { inviteToken };
    if (needsReset(list)) tokens.resetToken = await createResetToken(jar, pg, SEED.secondMember.email);
    return { storageState, tokens };
  };

  const results = [];
  const shootAll = async (list, state) => {
    for (const route of list)
      for (const variant of variantNames) {
        // route.isolate: this route changes data, so every variant starts from a freshly seeded
        // database instead of the one the other routes share.
        let s = state;
        if (route.isolate) {
          await restoreMigratedData(pg, migrated);
          s = await seedState([route]);
        }
        const r = await shootRoute(browser, vite.url, route, s, variant);
        results.push(r);
        log(`${r.errors.length ? 'WARN' : 'ok  '} ${path.basename(r.file)}  (${r.url})${r.errors.length ? '  ' + r.errors.join('; ') : ''}`);
      }
  };

  // 1. Routes that need a fresh installation (/setup) go first, before anything is seeded.
  await shootAll(routes.filter((r) => r.auth === 'fresh'), { tokens: {} });
  // 2. Seed, then the routes that only read; isolated routes reseed per variant, so they go last.
  const shared = routes.filter((r) => r.auth !== 'fresh' && !r.isolate);
  const isolated = routes.filter((r) => r.auth !== 'fresh' && r.isolate);
  if (shared.length) await shootAll(shared, await seedState(shared));
  await shootAll(isolated, null);
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  const bad = results.filter((r) => r.errors.length);
  log(`done: ${results.length} screenshots in ${outDir}${bad.length ? `, ${bad.length} with step errors (see results.json)` : ''}`);
  if (bad.length) exitCode = 1;
} catch (e) {
  console.error(`shoot: ${e.message}`);
  exitCode = 1;
} finally {
  await cleanup();
}
process.exit(exitCode);
