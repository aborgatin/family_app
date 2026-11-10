import { useSyncExternalStore } from 'react';
import type { ErrorMessage } from '@/shared/api';

/*
 * «Не удалось сохранить» after the server rejected an Outbox operation (spec #3 "Rejected
 * operation"): shown once, app-wide, wherever the Member is when the push answers, whether or not
 * the screen that made the change is still open. The engine records the rejection here; the
 * Member's next change or `dismiss()` hides it.
 */

/**
 * Rejection code → i18n key (I3). The keys read «Не удалось сохранить: …» with the reason; any
 * other code (`validation.failed`, an unknown one) shows plain «Не удалось сохранить».
 */
const REJECTION_KEYS = {
  'list.not_found': 'sync.rejected.listNotFound',
  'list.owner_only': 'sync.rejected.listOwnerOnly',
  'list.kind_immutable': 'sync.rejected.listKindImmutable',
  'list.wish_shared_only': 'sync.rejected.listWishSharedOnly',
  'child_field.value_type_immutable': 'sync.rejected.childFieldValueTypeImmutable',
  'sync.read_only': 'sync.rejected.readOnly',
  // Not something the Member can cause from the app (another List's Category, a Category on a Todo
  // list): plain «Не удалось сохранить».
  'category.list_not_shopping': 'sync.saveRejected',
  'item.category_not_found': 'sync.saveRejected',
} as const satisfies Readonly<Record<string, ErrorMessage['key']>>;

export function rejectionMessage(code: string): ErrorMessage {
  const key: ErrorMessage['key'] =
    (REJECTION_KEYS as Readonly<Record<string, ErrorMessage['key']>>)[code] ?? 'sync.saveRejected';
  return { key, values: {} };
}

let shown: ErrorMessage | undefined;
const listeners = new Set<() => void>();

function set(message: ErrorMessage | undefined) {
  if (message === shown) return;
  shown = message;
  listeners.forEach((listener) => {
    listener();
  });
}

/** Called by the engine for a rejected operation; several in one push show the last one. */
export function saveRejected(code: string): void {
  set(rejectionMessage(code));
}

/** Hides the message (the Member's next change, or closing it). */
export function dismissSaveRejection(): void {
  set(undefined);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The rejection to show now (`undefined`: none) and `dismiss`, for the one app-level place that
 * shows it.
 */
export function useSaveRejection(): { message: ErrorMessage | undefined; dismiss: () => void } {
  const message = useSyncExternalStore(subscribe, () => shown);
  return { message, dismiss: dismissSaveRejection };
}
