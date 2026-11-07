import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { ParseKeys } from 'i18next';
import { ApiError, errorMessageKey, fieldErrorMessageKey } from '@/shared/api';
import { GrammaticalGenderChoice, TextField, type GrammaticalGender } from '@/shared/ui';
import { bootstrap } from './authApi';
import { useSession } from './session';

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

/** One-time registration of the first Member on a fresh installation (`/setup`). */
export function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loggedIn } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [grammaticalGender, setGrammaticalGender] = useState<GrammaticalGender>();
  const [fieldErrors, setFieldErrors] = useState<FieldMessages>({});
  const [formError, setFormError] = useState<ParseKeys>();
  const [submitting, setSubmitting] = useState(false);

  async function register() {
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
      const member = await bootstrap({ email, password, displayName, grammaticalGender });
      loggedIn(member);
      await navigate('/', { replace: true });
    } catch (error: unknown) {
      setSubmitting(false);
      const apiError = error instanceof ApiError ? error : new ApiError(0, 'unknown');
      const fromServer: FieldMessages = {};
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
    void register();
  }

  const message = (field: Field) => {
    const key = fieldErrors[field];
    return key === undefined ? undefined : t(key);
  };

  return (
    <main>
      <h1>{t('setup.title')}</h1>
      <p>{t('setup.intro')}</p>
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
          {submitting ? t('setup.submitting') : t('setup.submit')}
        </button>
      </form>
    </main>
  );
}
