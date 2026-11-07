import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, errorMessage, fieldErrorMessageKey, type ErrorMessage } from '@/shared/api';
import { TextField } from '@/shared/ui';
import { login } from './authApi';
import { useSession } from './session';

/**
 * Login on this device (`/login`). On success the route guard takes the Member to where they were
 * going before it sent them here.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const { loggedIn } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [missing, setMissing] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });
  const [formError, setFormError] = useState<ErrorMessage>();
  const [submitting, setSubmitting] = useState(false);

  async function logIn() {
    const nowMissing = { email: email.trim() === '', password: password === '' };
    setMissing(nowMissing);
    setFormError(undefined);
    if (nowMissing.email || nowMissing.password) {
      return;
    }

    setSubmitting(true);
    try {
      loggedIn(await login({ email, password }));
    } catch (error: unknown) {
      setSubmitting(false);
      const apiError = error instanceof ApiError ? error : new ApiError(0, 'unknown');
      if (apiError.code === 'auth.invalid_credentials') {
        setPassword('');
      }
      setFormError(errorMessage(apiError));
    }
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void logIn();
  }

  const required = t(fieldErrorMessageKey('required'));

  return (
    <main>
      <h1>{t('login.title')}</h1>
      <form noValidate onSubmit={onSubmit}>
        <TextField
          label={t('login.email')}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          error={missing.email ? required : undefined}
        />
        <TextField
          label={t('login.password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          error={missing.password ? required : undefined}
        />
        {formError !== undefined && <p role="alert">{t(formError.key, formError.values)}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? t('login.submitting') : t('login.submit')}
        </button>
      </form>
    </main>
  );
}
