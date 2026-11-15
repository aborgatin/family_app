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
