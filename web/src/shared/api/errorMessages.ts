import type { ParseKeys } from 'i18next';
import type { ApiError } from './apiClient';

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
  'auth.invalid_credentials': 'errors.authInvalidCredentials',
  'auth.too_many_attempts': 'errors.authTooManyAttempts',
  'password_reset.not_found': 'errors.passwordResetNotFound',
  'password_reset.expired': 'errors.passwordResetExpired',
  'password_reset.used': 'errors.passwordResetUsed',
  'child_field.deleted': 'errors.childFieldDeleted',
  'child_field.value_type_immutable': 'errors.childFieldValueTypeImmutable',
  'invite.not_found': 'errors.inviteNotFound',
  'invite.expired': 'errors.inviteExpired',
  'invite.used': 'errors.inviteUsed',
  'invite.revoked': 'errors.inviteRevoked',
  'member.email_taken': 'errors.memberEmailTaken',
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

/** An i18n key plus the values it interpolates; show it with `t(message.key, message.values)`. */
export interface ErrorMessage {
  key: MessageKey;
  values: { count?: number };
}

/**
 * The message for an error, including values taken from its params, e.g. how many minutes to wait
 * after `auth.too_many_attempts`. Codes without params get `errorMessageKey(code)`.
 */
export function errorMessage(error: ApiError): ErrorMessage {
  const key = errorMessageKey(error.code);
  if (error.code === 'auth.too_many_attempts') {
    const seconds = error.params.retryAfterSeconds;
    if (typeof seconds === 'number' && seconds > 0) {
      return { key, values: { count: Math.ceil(seconds / 60) } };
    }
    return { key: 'errors.authTooManyAttemptsNoWait', values: {} };
  }
  return { key, values: {} };
}
