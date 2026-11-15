import { api } from '@/shared/api';

// The server's push endpoints (backend.md "notifications"). Online only: called directly.

/** The application server key (VAPID public key, base64url) this device subscribes with. */
export async function fetchVapidPublicKey(): Promise<string> {
  const { publicKey } = await api.get<{ publicKey: string }>('/api/push/vapid-public-key');
  return publicKey;
}

/** Registers this device's subscription for the logged-in Member and this session. Idempotent. */
export function sendSubscription(subscription: PushSubscriptionJSON): Promise<void> {
  return api.post<undefined>('/api/push/subscriptions', subscription);
}

/** Forgets this device's subscription, by its endpoint. */
export function deleteSubscription(endpoint: string): Promise<void> {
  return api.delete<undefined>('/api/push/subscriptions', { endpoint });
}
