import { http, HttpResponse } from 'msw';
import { afterEach } from 'vitest';
import { server } from './server';

/*
 * A device that can receive push, for tests: jsdom has no `Notification`, `PushManager` or
 * `navigator.serviceWorker`, so without this every test runs on a device where push isn't
 * available (Safari on iPhone, not installed). `fakePushDevice()` puts in fakes of all three;
 * they go again after each test.
 */

type Permission = 'default' | 'granted' | 'denied';

/** The subscription a fake device holds, as `PushSubscription.toJSON()` gives it. */
export interface SubscriptionJson {
  endpoint: string;
  expirationTime: null;
  keys: { p256dh: string; auth: string };
}

/** A subscription's JSON with this endpoint and made-up keys. */
export function subscriptionJson(endpoint: string): SubscriptionJson {
  return { endpoint, expirationTime: null, keys: { p256dh: `p256dh-of-${endpoint}`, auth: 'auth' } };
}

interface FakePushDeviceOptions {
  /** `Notification.permission` at start. */
  permission?: Permission;
  /** What the permission prompt answers (when it is shown: permission `default`). */
  answer?: Exclude<Permission, 'default'>;
  /** The endpoint of the subscription the device already holds, if any. */
  subscribedAt?: string;
}

let installed = false;

/**
 * Installs a device that supports push. `requests` counts permission prompts, `subscribes` the
 * `pushManager.subscribe()` calls with their options, `unsubscribes` the subscription's own
 * `unsubscribe()` calls; `subscription()` is the subscription the device holds now.
 */
export function fakePushDevice({
  permission = 'default',
  answer = 'granted',
  subscribedAt,
}: FakePushDeviceOptions = {}) {
  let current: Permission = permission;
  let held: SubscriptionJson | undefined =
    subscribedAt === undefined ? undefined : subscriptionJson(subscribedAt);
  const device = {
    requests: 0,
    subscribes: [] as PushSubscriptionOptionsInit[],
    unsubscribes: 0,
    subscription: () => held,
  };

  const asSubscription = (json: SubscriptionJson) => ({
    endpoint: json.endpoint,
    toJSON: () => json,
    unsubscribe: () => {
      device.unsubscribes += 1;
      held = undefined;
      return Promise.resolve(true);
    },
  });

  const FakeNotification = {
    get permission() {
      return current;
    },
    requestPermission: () => {
      device.requests += 1;
      if (current === 'default') current = answer;
      return Promise.resolve(current);
    },
  };
  const pushManager = {
    getSubscription: () => Promise.resolve(held === undefined ? null : asSubscription(held)),
    subscribe: (options: PushSubscriptionOptionsInit) => {
      device.subscribes.push(options);
      if (current !== 'granted') return Promise.reject(new DOMException('', 'NotAllowedError'));
      held ??= subscriptionJson(`https://push.example/${device.subscribes.length}`);
      return Promise.resolve(asSubscription(held));
    },
  };

  Object.defineProperty(window, 'Notification', { configurable: true, value: FakeNotification });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  });
  installed = true;
  return device;
}

afterEach(() => {
  if (!installed) return;
  installed = false;
  Reflect.deleteProperty(window, 'Notification');
  Reflect.deleteProperty(window, 'PushManager');
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

/** The VAPID public key the fake server gives: base64url of the bytes 4, 1, 2. */
export const VAPID_PUBLIC_KEY = 'BAEC';

/**
 * The server's push endpoints: the VAPID key, and `POST` / `DELETE /api/push/subscriptions`,
 * recorded in `posted` and `deleted` (their bodies) in order. `failPosts()` makes `POST`s fail.
 */
export function pushServer() {
  const record = {
    posted: [] as unknown[],
    deleted: [] as unknown[],
    failing: false,
    failPosts() {
      record.failing = true;
    },
  };
  server.use(
    http.get('/api/push/vapid-public-key', () =>
      HttpResponse.json({ publicKey: VAPID_PUBLIC_KEY }),
    ),
    http.post('/api/push/subscriptions', async ({ request }) => {
      if (record.failing) return HttpResponse.json({ code: 'unknown' }, { status: 500 });
      record.posted.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete('/api/push/subscriptions', async ({ request }) => {
      record.deleted.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return record;
}
