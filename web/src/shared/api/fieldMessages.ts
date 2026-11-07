import type { ParseKeys } from 'i18next';
import { ApiError } from './apiClient';
import { errorMessage, fieldErrorMessageKey, type ErrorMessage } from './errorMessages';

/** Field → i18n key of its error message. */
export type FieldMessages<F extends string> = Partial<Record<F, ParseKeys>>;

/** «required» on a choice reads «Выберите вариант», not «Заполните это поле». */
export function fieldMessageKey(code: string, isChoice = false): ParseKeys {
  return isChoice && code === 'required'
    ? 'errors.field.choiceRequired'
    : fieldErrorMessageKey(code);
}

/**
 * Splits a failed save into messages for the form's own fields and, when none of them applies, a
 * message for the whole form.
 */
export function failureMessages<F extends string>(
  error: unknown,
  fields: readonly F[],
  choiceFields: readonly F[] = [],
): { fieldMessages: FieldMessages<F>; formMessage: ErrorMessage | undefined } {
  const apiError = error instanceof ApiError ? error : new ApiError(0, 'unknown');
  const fieldMessages: FieldMessages<F> = {};
  for (const { field, code } of apiError.fieldErrors) {
    const known = fields.find((f) => f === field);
    if (known !== undefined) {
      fieldMessages[known] = fieldMessageKey(code, choiceFields.includes(known));
    }
  }
  return {
    fieldMessages,
    formMessage: Object.keys(fieldMessages).length === 0 ? errorMessage(apiError) : undefined,
  };
}
