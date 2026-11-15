import { deleteSubscription, fetchVapidPublicKey, sendSubscription } from './pushApi';

/*
 * This device and push (spec #104, "Subscriptions" and "Client re-sync"): whether it can receive
 * push, and its subscription. Shared, since Settings subscribes, the auth guard re-sends the
 * subscription at launch and logout forgets it.
 */

/**
 * What this device can do about push:
 * - `unavailable`: no Push API here (Safari on iPhone outside an installed app has none);
 * - `denied`: the Member refused permission (only the system settings can change that);
 * - `notSubscribed`: permission not asked yet, or granted but there is no subscription;
 * - `subscribed`: permission granted and the device holds a subscription.
 */
export type PushState = 'unavailable' | 'denied' | 'notSubscribed' | 'subscribed';

/** Whether this browser has the Push API at all. */
function pushAvailable(): boolean {
  return 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;
}

/** Whether this browser has the Push API and the Member allowed push on this device. */
function pushGranted(): boolean {
  return pushAvailable() && Notification.permission === 'granted';
}

/** The launch re-sync under way, if any (`resyncSubscription`). */
let resyncing: Promise<void> | undefined;

/**
 * At launch, with the Notifications switch on: when permission is granted, sends the server this
 * device's subscription, subscribing again first if iOS dropped it. Idempotent on the server. A
 * failure is silent; the next launch tries again.
 */
export function resyncSubscription(): Promise<void> {
  if (!pushGranted()) return Promise.resolve();
  const run = (async () => {
    try {
      await sendCurrentOrNewSubscription();
    } catch {
      // Silent: the next launch sends it again.
    }
  })();
  resyncing = run;
  void run.finally(() => {
    if (resyncing === run) resyncing = undefined;
  });
  return run;
}

/** This device's push state now (after a launch re-sync under way, which may subscribe). */
export async function readPushState(): Promise<PushState> {
  if (!pushAvailable()) return 'unavailable';
  await resyncing;
  const permission = Notification.permission;
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'notSubscribed';
  return (await heldSubscription()) === null ? 'notSubscribed' : 'subscribed';
}

/**
 * Turns push on for this device: asks for permission (at once, so call it inside the tap: iOS asks
 * only then), then subscribes with the server's key (or takes the subscription the device already
 * holds) and sends it to the server. Resolves with the state it ends in; rejects with an
 * `ApiError` when the server can't be told.
 */
export function subscribeThisDevice(): Promise<PushState> {
  if (!pushAvailable()) return Promise.resolve('unavailable');
  const asking = Notification.requestPermission();
  return asking.then(async (permission) => {
    if (permission === 'denied') return 'denied';
    if (permission !== 'granted') return 'notSubscribed';
    await sendCurrentOrNewSubscription();
    return 'subscribed';
  });
}

/** The subscription this device holds, or `null`. */
async function heldSubscription(): Promise<PushSubscription | null> {
  const { pushManager } = await navigator.serviceWorker.ready;
  return pushManager.getSubscription();
}

/** Sends the server the subscription this device holds, subscribing first when it holds none. */
async function sendCurrentOrNewSubscription(): Promise<void> {
  const subscription = (await heldSubscription()) ?? (await newSubscription());
  await sendSubscription(subscription.toJSON());
}

async function newSubscription(): Promise<PushSubscription> {
  const { pushManager } = await navigator.serviceWorker.ready;
  return pushManager.subscribe({
    // eslint-disable-next-line no-restricted-syntax -- the Push API's own option name
    userVisibleOnly: true,
    applicationServerKey: base64UrlBytes(await fetchVapidPublicKey()),
  });
}

/**
 * At logout, while the session lasts: tells the server to forget this device's subscription, so
 * the next person on the device gets none of the Member's pushes. Resolves either way: when the
 * server can't be told, ending the session deletes the subscription there too. The device keeps
 * its subscription; the next login sends it again.
 */
export async function forgetSubscription(): Promise<void> {
  if (!pushGranted()) return;
  try {
    const subscription = await heldSubscription();
    if (subscription !== null) await deleteSubscription(subscription.endpoint);
  } catch {
    // The session's end deletes it on the server.
  }
}

/** The bytes of a base64url string (with or without padding). */
function base64UrlBytes(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
