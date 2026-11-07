import { useEffect, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import type { ParseKeys } from 'i18next';
import { asApiError, errorMessageKey, fieldErrorMessageKey } from '@/shared/api';
import { TextField } from '@/shared/ui';
import { completePasswordReset, fetchPasswordReset } from './authApi';
import { LOGIN_PATH } from './AuthGuard';
import { useSession } from './session';

/** The codes that mean the link itself doesn't work; the form makes no sense then. */
const LINK_ERRORS: ReadonlySet<string> = new Set([
  'password_reset.not_found',
  'password_reset.expired',
  'password_reset.used',
]);

type LinkState =
  | { status: 'checking' }
  | { status: 'working' }
  | { status: 'broken'; message: ParseKeys }
  | { status: 'unreachable'; message: ParseKeys };

/**
 * Setting a new password from a one-time reset link (`/reset-password/:token`) that the operator
 * created. Says up front when the link is expired, used or unknown. On success this device is
 * logged in and every other device of the Member is logged out (by the server).
 */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token = '' } = useParams();
  const { loggedIn } = useSession();

  const [link, setLink] = useState<LinkState>({ status: 'checking' });
  const [attempt, setAttempt] = useState(0);
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<ParseKeys>();
  const [formError, setFormError] = useState<ParseKeys>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let current = true;
    fetchPasswordReset(token).then(
      () => {
        if (current) setLink({ status: 'working' });
      },
      (error: unknown) => {
        if (!current) return;
        const { code } = asApiError(error);
        setLink({
          status: LINK_ERRORS.has(code) ? 'broken' : 'unreachable',
          message: errorMessageKey(code),
        });
      },
    );
    return () => {
      current = false;
    };
  }, [token, attempt]);

  async function save() {
    setFormError(undefined);
    if (password === '') {
      setFieldError(fieldErrorMessageKey('required'));
      return;
    }
    setFieldError(undefined);

    setSubmitting(true);
    try {
      loggedIn(await completePasswordReset(token, password));
      await navigate('/', { replace: true });
    } catch (error: unknown) {
      setSubmitting(false);
      const apiError = asApiError(error);
      if (LINK_ERRORS.has(apiError.code)) {
        setLink({ status: 'broken', message: errorMessageKey(apiError.code) });
        return;
      }
      const passwordError = apiError.fieldErrors.find(({ field }) => field === 'newPassword');
      if (passwordError === undefined) {
        setFormError(errorMessageKey(apiError.code));
      } else {
        setFieldError(fieldErrorMessageKey(passwordError.code));
      }
    }
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }

  if (link.status === 'checking') {
    return <p role="status">{t('common.loading')}</p>;
  }

  return (
    <main>
      <h1>{t('resetPassword.title')}</h1>
      {link.status === 'broken' && (
        <>
          <p role="alert">{t(link.message)}</p>
          <p>
            <Link to={LOGIN_PATH}>{t('resetPassword.toLogin')}</Link>
          </p>
        </>
      )}
      {link.status === 'unreachable' && (
        <>
          <p role="alert">{t(link.message)}</p>
          <button
            type="button"
            onClick={() => {
              setLink({ status: 'checking' });
              setAttempt((n) => n + 1);
            }}
          >
            {t('common.retry')}
          </button>
        </>
      )}
      {link.status === 'working' && (
        <>
          <p>{t('resetPassword.intro')}</p>
          <form noValidate onSubmit={onSubmit}>
            <TextField
              label={t('resetPassword.newPassword')}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              error={fieldError === undefined ? undefined : t(fieldError)}
            />
            <p>{t('resetPassword.passwordHint')}</p>
            {formError !== undefined && <p role="alert">{t(formError)}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? t('resetPassword.submitting') : t('resetPassword.submit')}
            </button>
          </form>
        </>
      )}
    </main>
  );
}
