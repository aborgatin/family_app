import type { ParseKeys } from 'i18next';

type MessageKey = ParseKeys;

/**
 * API error code → i18n key (I3). Add a line here when the API gets a new code the user may see.
 * Anything not listed shows `errors.generic`.
 */
const ERROR_KEYS: Readonly<Record<string, MessageKey>> = {
  'network.unavailable': 'errors.networkUnavailable',
  'auth.required': 'errors.authRequired',
  'auth.csrf_invalid': 'errors.authCsrfInvalid',
  'auth.bootstrap_closed': 'errors.authBootstrapClosed',
  'validation.failed': 'errors.validationFailed',
};

/** Field error code (inside `validation.failed`) → i18n key. */
const FIELD_ERROR_KEYS: Readonly<Record<string, MessageKey>> = {
  required: 'errors.field.required',
  'email.invalid': 'errors.field.emailInvalid',
  'password.too_short': 'errors.field.passwordTooShort',
  too_long: 'errors.field.tooLong',
  'value.invalid': 'errors.field.valueInvalid',
};

export function errorMessageKey(code: string): MessageKey {
  return ERROR_KEYS[code] ?? 'errors.generic';
}

export function fieldErrorMessageKey(code: string): MessageKey {
  return FIELD_ERROR_KEYS[code] ?? 'errors.field.invalid';
}
