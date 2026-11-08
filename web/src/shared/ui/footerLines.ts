import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParseKeys } from 'i18next';
import type { ErrorMessage, FieldMessages } from '@/shared/api';
import type { SectionMessage } from './GroupedSection';

type Line = SectionMessage | false;

interface FormLines<F extends string> {
  /** The form's fields (each a row `name`), in the order their lines show. */
  fields: readonly F[];
  /** Field → i18n key of its error, shown under the row instead of its hint. */
  fieldErrors: FieldMessages<F>;
  /** A failure about the whole form (`failureMessages().formMessage`), after the fields' lines. */
  formError?: ErrorMessage | undefined;
  /** Field → already translated hint, shown while the field has no error. */
  hints?: Partial<Record<F, string>>;
  /** Announce the fields' errors (`alert`), e.g. when they come from the server after a submit. */
  announce?: boolean;
}

/**
 * Footer lines (`GroupedSection` `messages`) for the usual failures, translated:
 *
 * - `failure(error, retry?)`: a red line about the whole group (a failed delete, a list that
 *   couldn't load), with «Повторить» when `retry` is given; `false` without an error.
 * - `form({fields, fieldErrors, formError, hints})`: a red line under each field with an error
 *   (otherwise its hint), then the failure of the whole form.
 */
export function useFooterLines() {
  const { t } = useTranslation();
  return useMemo(() => {
    function failure(error: ErrorMessage | undefined, retry?: () => void): Line {
      if (error === undefined) return false;
      return {
        text: t(error.key, error.values),
        tone: 'error',
        ...(retry !== undefined && { action: { label: t('common.retry'), onClick: retry } }),
      };
    }

    function form<F extends string>({
      fields,
      fieldErrors,
      formError,
      hints = {},
      announce = false,
    }: FormLines<F>): Line[] {
      return [
        ...fields.map((field): Line => {
          const key: ParseKeys | undefined = fieldErrors[field];
          if (key !== undefined) {
            return { row: field, text: t(key), tone: 'error', ...(announce && { announce }) };
          }
          const hint = hints[field];
          return hint !== undefined && { row: field, text: hint };
        }),
        failure(formError),
      ];
    }

    return { failure, form };
  }, [t]);
}
