import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApiError,
  asApiError,
  errorMessageKey,
  failureMessages,
  fieldMessageKey,
  type ErrorMessage,
  type FieldMessages,
} from '@/shared/api';
import { Button, Form, GroupedSection, InputRow, useFooterLines } from '@/shared/ui';
import type { GrammaticalGender, Registration } from './authApi';
import { GrammaticalGenderRow } from './GrammaticalGenderRow';

type Field = 'email' | 'password' | 'displayName' | 'grammaticalGender';
const FIELDS: readonly Field[] = ['email', 'password', 'displayName', 'grammaticalGender'];

interface RegistrationFormProps {
  /** Already translated. */
  submitLabel: string;
  /** Already translated. */
  submittingLabel: string;
  /** Sends the registration; the form shows the failure unless `handled` takes it. */
  register: (registration: Registration) => Promise<void>;
  /** Lets the page take a failure that isn't about the form (e.g. a broken link). */
  handled?: (error: ApiError) => boolean;
}

/**
 * The registration form shared by the first Member (`/setup`) and someone with an
 * Invite (`/invite/:token`): email, password, display name and the required «Пол» («Мужской» / «Женский»)
 * choice. Field errors show in the group footer, each describing its row; `member.email_taken` next to the email.
 */
export function RegistrationForm({
  submitLabel,
  submittingLabel,
  register,
  handled,
}: RegistrationFormProps) {
  const { t } = useTranslation();
  const lines = useFooterLines();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [grammaticalGender, setGrammaticalGender] = useState<GrammaticalGender>();
  const [fieldErrors, setFieldErrors] = useState<FieldMessages<Field>>({});
  const [formError, setFormError] = useState<ErrorMessage>();
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const missing: FieldMessages<Field> = {};
    if (email.trim() === '') missing.email = fieldMessageKey('required');
    if (password === '') missing.password = fieldMessageKey('required');
    if (displayName.trim() === '') missing.displayName = fieldMessageKey('required');
    if (grammaticalGender === undefined) {
      missing.grammaticalGender = fieldMessageKey('required', true);
    }
    setFieldErrors(missing);
    setFormError(undefined);
    if (grammaticalGender === undefined || Object.keys(missing).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      await register({ email, password, displayName, grammaticalGender });
    } catch (error: unknown) {
      setSubmitting(false);
      const apiError = asApiError(error);
      if (handled?.(apiError) === true) {
        return;
      }
      if (apiError.code === 'member.email_taken') {
        setFieldErrors({ email: errorMessageKey(apiError.code) });
        return;
      }
      const { fieldMessages, formMessage } = failureMessages(apiError, FIELDS, [
        'grammaticalGender',
      ]);
      setFieldErrors(fieldMessages);
      setFormError(formMessage);
    }
  }

  return (
    <Form onSubmit={() => void submit()}>
      <GroupedSection
        messages={lines.form({
          fields: FIELDS,
          fieldErrors,
          formError,
          hints: { password: t('setup.passwordHint') },
        })}
      >
        <InputRow
          label={t('setup.email')}
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
        />
        <InputRow
          label={t('setup.password')}
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
        />
        <InputRow
          label={t('setup.displayName')}
          name="displayName"
          autoComplete="name"
          value={displayName}
          onChange={setDisplayName}
        />
        <GrammaticalGenderRow
          name="grammaticalGender"
          value={grammaticalGender}
          onChange={setGrammaticalGender}
        />
      </GroupedSection>
      <Button variant="primary" type="submit" disabled={submitting}>
        {submitting ? submittingLabel : submitLabel}
      </Button>
    </Form>
  );
}
