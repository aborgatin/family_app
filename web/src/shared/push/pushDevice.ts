import { fetchVapidPublicKey, sendSubscription } from './pushApi';

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
export function pushAvailable(): boolean {
  return 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;
}

/** This device's push state now. */
export async function readPushState(): Promise<PushState> {
  if (!pushAvailable()) return 'unavailable';
  const permission = Notification.permission;
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'notSubscribed';
  const { pushManager } = await navigator.serviceWorker.ready;
  return (await pushManager.getSubscription()) === null ? 'notSubscribed' : 'subscribed';
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
    await sendSubscription((await currentOrNewSubscription()).toJSON());
    return 'subscribed';
  });
}

async function currentOrNewSubscription(): Promise<PushSubscription> {
  const { pushManager } = await navigator.serviceWorker.ready;
  const current = await pushManager.getSubscription();
  if (current !== null) return current;
  return pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlBytes(await fetchVapidPublicKey()),
  });
}

/** The bytes of a base64url string (with or without padding). */
function base64UrlBytes(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
