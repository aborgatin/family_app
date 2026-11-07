import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParseKeys } from 'i18next';
import { ApiError, asApiError, errorMessageKey, fieldErrorMessageKey } from '@/shared/api';
import { GrammaticalGenderChoice, TextField, type GrammaticalGender } from '@/shared/ui';
import type { Registration } from './authApi';

type Field = 'email' | 'password' | 'displayName' | 'grammaticalGender';
type FieldMessages = Partial<Record<Field, ParseKeys>>;

const FIELDS: readonly Field[] = ['email', 'password', 'displayName', 'grammaticalGender'];

function isField(field: string): field is Field {
  return (FIELDS as readonly string[]).includes(field);
}

/** «required» on the choice reads «Выберите вариант», not «Заполните это поле». */
function messageFor(field: Field, code: string): ParseKeys {
  return field === 'grammaticalGender' && code === 'required'
    ? 'errors.field.choiceRequired'
    : fieldErrorMessageKey(code);
}

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
 * The registration form shared by the first Member (`/setup`) and an invited adult
 * (`/invite/:token`): email, password, display name and the required «Пол» («Мужской» / «Женский»)
 * choice. Server field errors show next to their fields; `member.email_taken` next to the email.
 */
export function RegistrationForm({
  submitLabel,
  submittingLabel,
  register,
  handled,
}: RegistrationFormProps) {
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [grammaticalGender, setGrammaticalGender] = useState<GrammaticalGender>();
  const [fieldErrors, setFieldErrors] = useState<FieldMessages>({});
  const [formError, setFormError] = useState<ParseKeys>();
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const missing: FieldMessages = {};
    if (email.trim() === '') missing.email = messageFor('email', 'required');
    if (password === '') missing.password = messageFor('password', 'required');
    if (displayName.trim() === '') missing.displayName = messageFor('displayName', 'required');
    if (grammaticalGender === undefined) {
      missing.grammaticalGender = messageFor('grammaticalGender', 'required');
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
      const fromServer: FieldMessages = {};
      if (apiError.code === 'member.email_taken') {
        fromServer.email = errorMessageKey(apiError.code);
      }
      for (const { field, code } of apiError.fieldErrors) {
        if (isField(field)) fromServer[field] = messageFor(field, code);
      }
      setFieldErrors(fromServer);
      if (Object.keys(fromServer).length === 0) {
        setFormError(errorMessageKey(apiError.code));
      }
    }
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  const message = (field: Field) => {
    const key = fieldErrors[field];
    return key === undefined ? undefined : t(key);
  };

  return (
    <form noValidate onSubmit={onSubmit}>
      <TextField
        label={t('setup.email')}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
        error={message('email')}
      />
      <TextField
        label={t('setup.password')}
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
        error={message('password')}
      />
      <TextField
        label={t('setup.displayName')}
        autoComplete="name"
        value={displayName}
        onChange={(event) => {
          setDisplayName(event.target.value);
        }}
        error={message('displayName')}
      />
      <GrammaticalGenderChoice
        value={grammaticalGender}
        onChange={setGrammaticalGender}
        error={message('grammaticalGender')}
      />
      {formError !== undefined && <p role="alert">{t(formError)}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? submittingLabel : submitLabel}
      </button>
    </form>
  );
}
